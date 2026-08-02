"""
Users router — profile updates, wishlist, watched list.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr
from core.deps import get_current_user
from processing import auth as user_auth
from processing import preprocess
from processing import email_service
from processing import session_manager
from processing import activity_store
import time

router = APIRouter(prefix="/api/users", tags=["users"])

# Fallback avatar URL used throughout this module
FALLBACK_PERSON = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"

# Store OTPs for email changes and account deletion
_user_otp_store: dict = {}


class ProfileUpdate(BaseModel):
    name: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    instagram_id: str | None = None
    auto_remove_wishlist: bool | None = None
    username: str | None = None
    public_profile: bool | None = None
    cover_url: str | None = None
    birthday: str | None = None
    location: str | None = None
    website: str | None = None
    preferences: dict | None = None
    theme: dict | None = None
    privacy: dict | None = None
    notifications: dict | None = None

class OnboardingData(BaseModel):
    categories: list[str] = []
    actors: list[str] = []
    actresses: list[str] = []
    directors: list[str] = []
    studios: list[str] = []

@router.post("/onboarding")
def save_onboarding(data: OnboardingData, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    if uname not in users:
        raise HTTPException(status_code=404, detail="User not found")
    
    users[uname]["onboarding_completed"] = True
    users[uname]["preferences"] = data.dict()
    user_auth.save_users(users)
    return {"message": "Onboarding completed successfully"}

class MovieAction(BaseModel):
    title: str

class ClientActivityLog(BaseModel):
    type: str
    movie_title: str | None = None
    movie_poster: str | None = None
    rating: float | None = None
    other_user: str | None = None
    metadata: dict | None = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class EmailInitRequest(BaseModel):
    new_email: EmailStr

class OTPVerifyRequest(BaseModel):
    otp: str


@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    udata = users.get(uname, {})
    
    profile = udata.get("profile", {})
    followers_list = udata.get("followers", [])
    following_list = udata.get("following", [])
    wishlist = udata.get("wishlist", [])
    watched = udata.get("watched_list", [])
    favs = udata.get("favorite_list", [])
    
    # Calculate followers and following list details
    followers_data = []
    for f_user in followers_list:
        f_info = users.get(f_user, {})
        followers_data.append({
            "username": f_user,
            "name": f_info.get("name", f_user),
            "photo_url": f_info.get("profile", {}).get("photo_url") or FALLBACK_PERSON
        })
        
    following_data = []
    for f_user in following_list:
        f_info = users.get(f_user, {})
        following_data.append({
            "username": f_user,
            "name": f_info.get("name", f_user),
            "photo_url": f_info.get("profile", {}).get("photo_url") or FALLBACK_PERSON
        })

    # Fetch movie details
    def fetch_movie_details(titles):
        details = []
        for title in titles:
            poster, rating, year = preprocess.fetch_poster(title)
            details.append({"title": title, "poster": poster, "rating": rating, "year": year})
        return details

    wishlist_details = fetch_movie_details(wishlist)
    watched_details = fetch_movie_details(watched)
    favorite_details = fetch_movie_details(favs)
    
    # Get reviews and ratings list
    interactions = udata.get("interactions", {})
    reviews_data = []
    ratings_data = []
    
    RATING_MEANINGS = {
        10: "Masterpiece", 9: "Incredible", 8: "Great", 7: "Good",
        6: "Okay", 5: "Average", 4: "Subpar", 3: "Bad", 2: "Awful", 1: "Abysmal"
    }
    
    for movie_title, m_data in interactions.items():
        if m_data.get("review") or m_data.get("rating"):
            poster, rating, year = preprocess.fetch_poster(movie_title)
            rev_obj = {
                "title": movie_title,
                "poster": poster,
                "review": m_data.get("review", ""),
                "rating": m_data.get("rating"),
                "rating_text": m_data.get("rating_text") or RATING_MEANINGS.get(int(round(m_data.get("rating", 5))), "Average"),
                "timestamp": m_data.get("watch_timestamp", 0),
                "likes": m_data.get("likes", []),
                "replies": m_data.get("replies", [])
            }
            if m_data.get("review"):
                reviews_data.append(rev_obj)
            if m_data.get("rating") is not None:
                ratings_data.append({
                    "title": movie_title,
                    "rating": m_data.get("rating"),
                    "rating_text": rev_obj["rating_text"],
                    "timestamp": m_data.get("watch_timestamp", 0)
                })
                
    reviews_data.sort(key=lambda x: x["timestamp"], reverse=True)
    ratings_data.sort(key=lambda x: x["timestamp"], reverse=True)
    
    user_activities = activity_store.get_timeline(uname, limit=1000)
    activity_count = len(user_activities)

    return {
        "username": uname,
        "name": udata.get("name"),
        "email": udata.get("email"),
        "profile": profile,
        "wishlist": wishlist_details,
        "watched_list": watched_details,
        "favorite_list": favorite_details,
        "settings": udata.get("settings", {"auto_remove_wishlist": True}),
        "preferences": udata.get("preferences", {}),
        "theme": udata.get("theme", {}),
        "privacy": udata.get("privacy", {}),
        "notifications": udata.get("notifications", {}),
        "safety": udata.get("safety", {}),
        "followers": followers_data,
        "following": following_data,
        "followers_count": len(followers_list),
        "following_count": len(following_list),
        "favorites_count": len(favs),
        "wishlist_count": len(wishlist),
        "watched_count": len(watched),
        "reviews_count": len(ratings_data),
        "activity_count": activity_count,
        "reviews": reviews_data,
        "ratings": ratings_data,
        "interactions": interactions
    }


@router.put("/profile")
def update_profile(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    if uname not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Handle username change first
    new_uname = uname
    if body.username and body.username != uname:
        valid, msg = user_auth.validate_username(body.username)
        if not valid:
            raise HTTPException(status_code=400, detail=msg)
        success, msg = user_auth.change_username(uname, body.username)
        if not success:
            raise HTTPException(status_code=400, detail=msg)
        new_uname = body.username
        session_manager.update_username_in_sessions(uname, body.username)
        # Reload users after change_username modifies it
        users = user_auth.load_users()

    if body.name is not None:
        users[new_uname]["name"] = body.name
        
    profile = users[new_uname].setdefault("profile", {})
    if body.bio is not None:
        profile["bio"] = body.bio
    if body.photo_url is not None:
        profile["photo_url"] = body.photo_url
    if body.instagram_id is not None:
        profile["instagram_id"] = body.instagram_id
    if body.cover_url is not None:
        profile["cover_url"] = body.cover_url
    if body.birthday is not None:
        profile["birthday"] = body.birthday
    if body.location is not None:
        profile["location"] = body.location
    if body.website is not None:
        profile["website"] = body.website
        
    if body.preferences is not None:
        existing_prefs = users[new_uname].get("preferences", {})
        existing_prefs.update(body.preferences)
        users[new_uname]["preferences"] = existing_prefs
    if body.theme is not None:
        users[new_uname]["theme"] = body.theme
    if body.privacy is not None:
        users[new_uname]["privacy"] = body.privacy
    if body.notifications is not None:
        users[new_uname]["notifications"] = body.notifications
        
    settings = users[new_uname].setdefault("settings", {})
    if body.auto_remove_wishlist is not None:
        settings["auto_remove_wishlist"] = body.auto_remove_wishlist
    if body.public_profile is not None:
        settings["public_profile"] = body.public_profile
        
    user_auth.save_users(users)
    return {"detail": "Profile updated", "profile": users[new_uname], "new_username": new_uname}

# ── Public Profiles & User Search ─────────────────────────────────────────────

@router.get("/search")
def search_users(q: str = Query(..., min_length=2), current_user: dict = Depends(get_current_user)):
    uname_curr = current_user["username"]
    users = user_auth.load_users()
    curr_following = users.get(uname_curr, {}).get("following", [])
    q = q.lower()
    results = []
    for uname, data in users.items():
        if q in uname.lower() or q in str(data.get("name", "")).lower():
            results.append({
                "username": uname,
                "name": data.get("name", uname),
                "photo_url": data.get("profile", {}).get("photo_url") or FALLBACK_PERSON,
                "followers_count": len(data.get("followers", [])),
                "is_following": uname in curr_following
            })
            if len(results) >= 15:
                break
    return {"query": q, "results": results}

@router.get("/public/{username}")
def get_public_profile(username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    if username not in users:
        raise HTTPException(status_code=404, detail="User not found")
        
    user_data = users[username]
    settings = user_data.get("settings", {})
    # Default to public if not explicitly set to false
    is_public = settings.get("public_profile", True)
    
    if not is_public:
        return {"public": False, "username": username, "message": "This profile is private"}
        
    profile = user_data.get("profile", {})
    
    # Detailed movie lists
    wishlist = user_data.get("wishlist", [])
    watched = user_data.get("watched_list", [])
    favs = user_data.get("favorite_list", [])
    
    def fetch_movie_details(titles):
        details = []
        for title in titles:
            poster, rating, year = preprocess.fetch_poster(title)
            details.append({"title": title, "poster": poster, "rating": rating, "year": year})
        return details

    wishlist_details = fetch_movie_details(wishlist)
    watched_details = fetch_movie_details(watched)
    favorite_details = fetch_movie_details(favs)
    
    # Followers and Following
    followers_list = user_data.get("followers", [])
    following_list = user_data.get("following", [])
    
    followers_data = []
    for f_user in followers_list:
        f_info = users.get(f_user, {})
        followers_data.append({
            "username": f_user,
            "name": f_info.get("name", f_user),
            "photo_url": f_info.get("profile", {}).get("photo_url") or FALLBACK_PERSON
        })
        
    following_data = []
    for f_user in following_list:
        f_info = users.get(f_user, {})
        following_data.append({
            "username": f_user,
            "name": f_info.get("name", f_user),
            "photo_url": f_info.get("profile", {}).get("photo_url") or FALLBACK_PERSON
        })

    # Mutual followers calculation
    target_followers = set(followers_list)
    current_following = set(users.get(uname, {}).get("following", []))
    mutual_set = target_followers.intersection(current_following)
    
    mutual_followers_data = []
    for m_user in mutual_set:
        m_info = users.get(m_user, {})
        mutual_followers_data.append({
            "username": m_user,
            "name": m_info.get("name", m_user),
            "photo_url": m_info.get("profile", {}).get("photo_url") or FALLBACK_PERSON
        })
        
    # Get reviews and ratings list
    interactions = user_data.get("interactions", {})
    reviews_data = []
    ratings_data = []
    
    RATING_MEANINGS = {
        10: "Masterpiece", 9: "Incredible", 8: "Great", 7: "Good",
        6: "Okay", 5: "Average", 4: "Subpar", 3: "Bad", 2: "Awful", 1: "Abysmal"
    }
    
    for movie_title, m_data in interactions.items():
        if m_data.get("review") or m_data.get("rating"):
            poster, rating, year = preprocess.fetch_poster(movie_title)
            rev_obj = {
                "title": movie_title,
                "poster": poster,
                "review": m_data.get("review", ""),
                "rating": m_data.get("rating"),
                "rating_text": m_data.get("rating_text") or RATING_MEANINGS.get(int(round(m_data.get("rating", 5))), "Average"),
                "timestamp": m_data.get("watch_timestamp", 0),
                "likes": m_data.get("likes", []),
                "replies": m_data.get("replies", [])
            }
            if m_data.get("review"):
                reviews_data.append(rev_obj)
            if m_data.get("rating") is not None:
                ratings_data.append({
                    "title": movie_title,
                    "rating": m_data.get("rating"),
                    "rating_text": rev_obj["rating_text"],
                    "timestamp": m_data.get("watch_timestamp", 0)
                })
                
    reviews_data.sort(key=lambda x: x["timestamp"], reverse=True)
    ratings_data.sort(key=lambda x: x["timestamp"], reverse=True)
    
    # Activity logs
    user_activities = activity_store.get_timeline(username, limit=1000)
    activity_count = len(user_activities)
    
    return {
        "public": True,
        "username": username,
        "name": user_data.get("name", username),
        "bio": profile.get("bio", "No bio available."),
        "photo_url": profile.get("photo_url") or FALLBACK_PERSON,
        "instagram_id": profile.get("instagram_id"),
        "cover_url": profile.get("cover_url"),
        "location": profile.get("location"),
        "website": profile.get("website"),
        "birthday": profile.get("birthday"),
        "wishlist": wishlist_details,
        "watched": watched_details,
        "favorites": favorite_details,
        "followers": followers_data,
        "following": following_data,
        "followers_count": len(followers_list),
        "following_count": len(following_list),
        "mutual_followers": mutual_followers_data,
        "mutual_followers_count": len(mutual_followers_data),
        "reviews": reviews_data,
        "ratings": ratings_data,
        "reviews_count": len(ratings_data),
        "activity_count": activity_count,
        "preferences": user_data.get("preferences", {}),
        "theme": user_data.get("theme", {}),
        "privacy": user_data.get("privacy", {}),
        "notifications": user_data.get("notifications", {})
    }

@router.post("/{target_username}/follow")
def follow_user(target_username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    if uname == target_username:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")
        
    users = user_auth.load_users()
    if target_username not in users:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    target_data = users[target_username]
    current_data = users[uname]
    
    # 1. Update current user's following
    following = current_data.setdefault("following", [])
    if target_username not in following:
        following.append(target_username)
        
    # 2. Update target user's followers
    followers = target_data.setdefault("followers", [])
    if uname not in followers:
        followers.append(uname)
        
    user_auth.save_users(users)
    activity_store.log_activity(uname, "follow", other_user=target_username)
    # Also log for the target user that they gained a follower
    activity_store.log_activity(target_username, "follower_gained", other_user=uname)
    
    # Add real notification
    from processing import notif_store
    actor_photo = current_data.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
    notif_store.add_notification(
        recipient=target_username,
        notif_type="follow",
        actor=uname,
        actor_photo=actor_photo,
        text=f"{current_data.get('name', uname)} started following you."
    )
    return {"detail": f"You are now following {target_username}"}

@router.delete("/{target_username}/follow")
def unfollow_user(target_username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    
    users = user_auth.load_users()
    if target_username not in users:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    target_data = users[target_username]
    current_data = users[uname]
    
    # 1. Update current user's following
    following = current_data.get("following", [])
    current_data["following"] = [u for u in following if u != target_username]
    
    # 2. Update target user's followers
    followers = target_data.get("followers", [])
    target_data["followers"] = [u for u in followers if u != uname]
        
    user_auth.save_users(users)
    activity_store.log_activity(uname, "unfollow", other_user=target_username)
    # Also log for the target user that they lost a follower
    activity_store.log_activity(target_username, "follower_lost", other_user=uname)
    return {"detail": f"You unfollowed {target_username}"}

# ── Account Management ────────────────────────────────────────────────────────

@router.post("/password")
def change_password(body: PasswordChangeRequest, current_user: dict = Depends(get_current_user)):
    valid, msg = user_auth.validate_password_strength(body.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)
        
    success, msg = user_auth.update_password(current_user["username"], body.current_password, body.new_password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"detail": "Password updated successfully"}

@router.post("/email/init")
def change_email_init(body: EmailInitRequest, current_user: dict = Depends(get_current_user)):
    if user_auth.is_email_registered(body.new_email):
        raise HTTPException(status_code=400, detail="Email already registered")
        
    otp = email_service.generate_otp()
    success, msg = email_service.send_otp_email(body.new_email, otp)
    
    key = f"email:{current_user['username']}"
    _user_otp_store[key] = {
        "otp": otp,
        "expires_at": time.time() + 300,
        "new_email": body.new_email
    }
    
    if not success and msg != "SMTP_NOT_CONFIGURED":
        raise HTTPException(status_code=500, detail="Failed to send OTP")
        
    return {"detail": "OTP sent to new email", "dev_otp": otp if msg == "SMTP_NOT_CONFIGURED" else None}

@router.post("/email/verify")
def change_email_verify(body: OTPVerifyRequest, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    key = f"email:{uname}"
    entry = _user_otp_store.get(key)
    
    if not entry:
        raise HTTPException(status_code=400, detail="No pending email change")
    if time.time() > entry["expires_at"]:
        del _user_otp_store[key]
        raise HTTPException(status_code=400, detail="OTP expired")
    if body.otp.strip() != entry["otp"]:
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    users = user_auth.load_users()
    users[uname]["email"] = entry["new_email"]
    user_auth.save_users(users)
    del _user_otp_store[key]
    
    return {"detail": "Email updated successfully", "email": entry["new_email"]}

@router.post("/delete/init")
def delete_account_init(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    email = current_user["data"]["email"]
    key = f"delete:{uname}"
    
    # Simple limits
    entry = _user_otp_store.get(key, {"attempts": 0, "resends": 0})
    if entry.get("resends", 0) >= 3:
        raise HTTPException(status_code=400, detail="Too many resend attempts. Try again later.")
        
    otp = email_service.generate_otp()
    success, msg = email_service.send_otp_email(email, otp)
    
    _user_otp_store[key] = {
        "otp": otp,
        "expires_at": time.time() + 300,
        "attempts": entry.get("attempts", 0),
        "resends": entry.get("resends", 0) + 1
    }
    
    return {"detail": "OTP sent", "dev_otp": otp if msg == "SMTP_NOT_CONFIGURED" else None}

@router.post("/delete/verify")
def delete_account_verify(body: OTPVerifyRequest, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    key = f"delete:{uname}"
    entry = _user_otp_store.get(key)
    
    if not entry:
        raise HTTPException(status_code=400, detail="No pending account deletion")
    if time.time() > entry["expires_at"]:
        del _user_otp_store[key]
        raise HTTPException(status_code=400, detail="OTP expired")
        
    if body.otp.strip() != entry["otp"]:
        entry["attempts"] += 1
        if entry["attempts"] >= 5:
            del _user_otp_store[key]
            raise HTTPException(status_code=400, detail="Too many invalid attempts. Deletion cancelled.")
        raise HTTPException(status_code=400, detail="Invalid OTP")
        
    # Proceed with deletion
    users = user_auth.load_users()
    if uname in users:
        del users[uname]
        user_auth.save_users(users)
        
    session_manager.revoke_all_user_sessions(uname)
    del _user_otp_store[key]
    
    return {"detail": "Account deleted successfully"}

# ── Session Management ────────────────────────────────────────────────────────

@router.get("/sessions")
def get_sessions(current_user: dict = Depends(get_current_user)):
    sessions = session_manager.get_user_sessions(current_user["username"])
    # Mark current session
    for s in sessions:
        s["is_current"] = (s["session_id"] == current_user["session_id"])
    return {"sessions": sessions}

@router.delete("/sessions/all")
def revoke_all_sessions(current_user: dict = Depends(get_current_user)):
    session_manager.revoke_all_user_sessions(current_user["username"], except_session_id=current_user["session_id"])
    return {"detail": "All other sessions revoked"}

@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, current_user: dict = Depends(get_current_user)):
    session = session_manager.get_session(session_id)
    if not session or session["username"] != current_user["username"]:
        raise HTTPException(status_code=404, detail="Session not found")
        
    session_manager.revoke_session(session_id)
    return {"detail": "Session revoked"}


# ── Wishlist ──────────────────────────────────────────────────────────────────

@router.get("/wishlist")
def get_wishlist(current_user: dict = Depends(get_current_user)):
    return {"wishlist": current_user["data"].get("wishlist", [])}


@router.get("/wishlist/details")
def get_wishlist_details(current_user: dict = Depends(get_current_user)):
    wishlist = current_user["data"].get("wishlist", [])
    results = []
    for title in wishlist:
        poster, rating, year = preprocess.fetch_poster(title)
        results.append({
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year
        })
    return {"wishlist": results}


@router.post("/wishlist")
def add_to_wishlist(body: MovieAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update list
    wishlist = users[uname].setdefault("wishlist", [])
    if body.title not in wishlist:
        wishlist.append(body.title)
        
    # 2. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    entry = interactions.setdefault(body.title, {
        "user_id": uname,
        "movie_id": body.title,
        "watched": False,
        "wishlist": True,
        "watch_timestamp": 0.0,
        "recommendation_score": 0.0
    })
    entry["wishlist"] = True
    entry["user_id"] = uname
    entry["movie_id"] = body.title
    
    user_auth.save_users(users)
    poster, _, _ = preprocess.fetch_poster(body.title)
    activity_store.log_activity(uname, "wishlist_add", movie_title=body.title, movie_poster=poster)
    return {"wishlist": wishlist}


@router.delete("/wishlist/{title}")
def remove_from_wishlist(title: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update list
    wishlist = users[uname].get("wishlist", [])
    users[uname]["wishlist"] = [m for m in wishlist if m != title]
    
    # 2. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    if title in interactions:
        interactions[title]["wishlist"] = False
        
    user_auth.save_users(users)
    poster, _, _ = preprocess.fetch_poster(title)
    activity_store.log_activity(uname, "wishlist_remove", movie_title=title, movie_poster=poster)
    return {"wishlist": users[uname]["wishlist"]}

@router.delete("/wishlist/all/clear")
def clear_wishlist(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    users[uname]["wishlist"] = []
    interactions = users[uname].setdefault("interactions", {})
    for title in interactions:
        interactions[title]["wishlist"] = False
        
    user_auth.save_users(users)
    return {"wishlist": []}

class ReviewAction(BaseModel):
    title: str
    rating: float
    review: str = ""

class ReviewLikeAction(BaseModel):
    title: str
    author_username: str

class ReviewReplyAction(BaseModel):
    title: str
    author_username: str
    text: str

RATING_MEANINGS = {
    10: "Masterpiece",
    9: "Incredible",
    8: "Great",
    7: "Good",
    6: "Okay",
    5: "Average",
    4: "Subpar",
    3: "Bad",
    2: "Awful",
    1: "Abysmal"
}

@router.post("/review")
def add_review(body: ReviewAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # Store review in interactions
    interactions = users[uname].setdefault("interactions", {})
    entry = interactions.setdefault(body.title, {
        "user_id": uname,
        "movie_id": body.title,
        "watch_timestamp": time.time()
    })
    entry["rating"] = body.rating
    entry["rating_text"] = RATING_MEANINGS.get(int(round(body.rating)), "Average")
    entry["review"] = body.review
    if "likes" not in entry:
        entry["likes"] = []
    if "replies" not in entry:
        entry["replies"] = []
    
    # Auto-add to watched list
    watched = users[uname].setdefault("watched_list", [])
    if body.title not in watched:
        watched.append(body.title)
        entry["watched"] = True
    
    user_auth.save_users(users)
    poster, _, _ = preprocess.fetch_poster(body.title)
    activity_store.log_activity(uname, "review", movie_title=body.title, movie_poster=poster, rating=body.rating)
    return {"detail": "Review added", "rating_text": entry["rating_text"]}

@router.post("/review/like")
def like_review(body: ReviewLikeAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    if body.author_username not in users:
        raise HTTPException(status_code=404, detail="Author not found")
        
    interactions = users[body.author_username].setdefault("interactions", {})
    if body.title not in interactions:
        raise HTTPException(status_code=404, detail="Review not found")
        
    entry = interactions[body.title]
    likes = entry.setdefault("likes", [])
    if uname in likes:
        likes.remove(uname)
        detail = "Review unliked"
        activity_type = "unlike"
    else:
        likes.append(uname)
        detail = "Review liked"
        activity_type = "like"
        
    user_auth.save_users(users)
    activity_store.log_activity(uname, activity_type, movie_title=body.title, metadata={"author": body.author_username})
    return {"detail": detail, "likes": likes}

@router.post("/review/reply")
def reply_to_review(body: ReviewReplyAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    if body.author_username not in users:
        raise HTTPException(status_code=404, detail="Author not found")
        
    interactions = users[body.author_username].setdefault("interactions", {})
    if body.title not in interactions:
        raise HTTPException(status_code=404, detail="Review not found")
        
    entry = interactions[body.title]
    replies = entry.setdefault("replies", [])
    
    import uuid
    reply = {
        "id": str(uuid.uuid4()),
        "username": uname,
        "name": users[uname].get("name", uname),
        "photo_url": users[uname].get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
        "text": body.text,
        "timestamp": time.time()
    }
    replies.append(reply)
    
    user_auth.save_users(users)
    activity_store.log_activity(uname, "comment", movie_title=body.title, metadata={"author": body.author_username, "reply_id": reply["id"]})
    return {"detail": "Reply added", "reply": reply}

@router.delete("/review/{title}")
def delete_review(title: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    interactions = users[uname].setdefault("interactions", {})
    if title not in interactions:
        raise HTTPException(status_code=404, detail="Review not found")
        
    entry = interactions[title]
    entry.pop("review", None)
    entry.pop("rating", None)
    entry.pop("rating_text", None)
    
    user_auth.save_users(users)
    activity_store.log_activity(uname, "review_delete", movie_title=title)
    return {"detail": "Review deleted"}

@router.get("/reviews/{title}")
def get_movie_reviews(title: str):
    users = user_auth.load_users()
    reviews = []
    for uname, udata in users.items():
        interactions = udata.get("interactions", {})
        if title in interactions:
            m_data = interactions[title]
            if m_data.get("review") or m_data.get("rating"):
                reviews.append({
                    "username": uname,
                    "name": udata.get("name", uname),
                    "photo_url": udata.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
                    "rating": m_data.get("rating"),
                    "rating_text": m_data.get("rating_text") or RATING_MEANINGS.get(int(round(m_data.get("rating", 5))), "Average"),
                    "review": m_data.get("review", ""),
                    "timestamp": m_data.get("watch_timestamp", 0),
                    "likes": m_data.get("likes", []),
                    "replies": m_data.get("replies", [])
                })
    reviews.sort(key=lambda r: r.get("timestamp", 0), reverse=True)
    return {"reviews": reviews}

@router.delete("/view/all/clear")
def clear_view_history(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    interactions = users[uname].setdefault("interactions", {})
    for title in interactions:
        interactions[title]["watch_timestamp"] = 0.0
        
    user_auth.save_users(users)
    return {"detail": "View history cleared"}

# ── Activity & Stats ──────────────────────────────────────────────────────────

@router.get("/activity/timeline")
def get_activity_timeline(limit: int = Query(50, le=200), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    events = activity_store.get_timeline(uname, limit)
    
    # Pre-fetch poster URLs for movies if they don't have them in the store
    enriched_events = []
    for e in events:
        if e.get('movie_title') and not e.get('movie_poster'):
            poster, _, _ = preprocess.fetch_poster(e['movie_title'])
            e['movie_poster'] = poster
        enriched_events.append(e)
        
    return {"timeline": enriched_events}

@router.get("/activity/stats")
def get_activity_stats(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    stats = activity_store.get_stats(uname)
    return stats


@router.post("/activity/log")
def log_user_activity(body: ClientActivityLog, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    event = activity_store.log_activity(
        username=uname,
        action_type=body.type,
        movie_title=body.movie_title,
        movie_poster=body.movie_poster,
        rating=body.rating,
        other_user=body.other_user,
        metadata=body.metadata
    )
    return {"detail": "Activity logged", "event": event}



# ── Watched ───────────────────────────────────────────────────────────────────

@router.get("/watched")
def get_watched(current_user: dict = Depends(get_current_user)):
    return {"watched_list": current_user["data"].get("watched_list", [])}


@router.post("/watched")
def add_to_watched(body: MovieAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update watched list
    watched = users[uname].setdefault("watched_list", [])
    if body.title not in watched:
        watched.append(body.title)
        
    # 2. Auto-remove from wishlist list (if setting is enabled)
    auto_remove = users[uname].get("settings", {}).get("auto_remove_wishlist", True)
    if auto_remove:
        users[uname]["wishlist"] = [m for m in users[uname].get("wishlist", []) if m != body.title]
    
    # 3. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    entry = interactions.setdefault(body.title, {
        "user_id": uname,
        "movie_id": body.title,
        "watched": True,
        "wishlist": False,
        "watch_timestamp": 0.0,
        "recommendation_score": 0.0
    })
    entry["watched"] = True
    if auto_remove:
        entry["wishlist"] = False # Auto-remove from wishlist
    entry["watch_timestamp"] = time.time()
    entry["user_id"] = uname
    entry["movie_id"] = body.title
    
    user_auth.save_users(users)
    poster, _, _ = preprocess.fetch_poster(body.title)
    activity_store.log_activity(uname, "watched", movie_title=body.title, movie_poster=poster)
    return {"watched_list": watched}


@router.delete("/watched/{title}")
def remove_from_watched(title: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update watched list
    watched = users[uname].get("watched_list", [])
    users[uname]["watched_list"] = [m for m in watched if m != title]
    
    # 2. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    if title in interactions:
        interactions[title]["watched"] = False
        
    user_auth.save_users(users)
    activity_store.log_activity(uname, "watched_remove", movie_title=title)
    return {"watched_list": users[uname]["watched_list"]}

@router.delete("/watched/all/clear")
def clear_watched(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    users[uname]["watched_list"] = []
    interactions = users[uname].setdefault("interactions", {})
    for title in interactions:
        interactions[title]["watched"] = False
        
    user_auth.save_users(users)
    return {"watched_list": []}


# ── Favorites ─────────────────────────────────────────────────────────────────

@router.get("/favorites")
def get_favorites(current_user: dict = Depends(get_current_user)):
    return {"favorite_list": current_user["data"].get("favorite_list", [])}


@router.post("/favorites")
def add_to_favorites(body: MovieAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update favorites list
    favorite_list = users[uname].setdefault("favorite_list", [])
    if body.title not in favorite_list:
        favorite_list.append(body.title)
        
    # 2. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    entry = interactions.setdefault(body.title, {
        "user_id": uname,
        "movie_id": body.title,
        "watched": False,
        "wishlist": False,
        "favorite": True,
        "watch_timestamp": 0.0,
        "recommendation_score": 0.0
    })
    entry["favorite"] = True
    entry["user_id"] = uname
    entry["movie_id"] = body.title
    
    user_auth.save_users(users)
    activity_store.log_activity(uname, "favorite_add", movie_title=body.title)
    return {"favorite_list": favorite_list}


@router.delete("/favorites/{title}")
def remove_from_favorites(title: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    # 1. Update favorite list
    favorite_list = users[uname].get("favorite_list", [])
    users[uname]["favorite_list"] = [m for m in favorite_list if m != title]
    
    # 2. Update interactions storage
    interactions = users[uname].setdefault("interactions", {})
    if title in interactions:
        interactions[title]["favorite"] = False
        
    user_auth.save_users(users)
    activity_store.log_activity(uname, "favorite_remove", movie_title=title)
    return {"favorite_list": users[uname]["favorite_list"]}

@router.delete("/favorites/all/clear")
def clear_favorites(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    users[uname]["favorite_list"] = []
    interactions = users[uname].setdefault("interactions", {})
    for title in interactions:
        interactions[title]["favorite"] = False
        
    user_auth.save_users(users)
    return {"favorite_list": []}


# ── View (Continue Watching) ──────────────────────────────────────────────────

@router.post("/view")
def record_view(body: MovieAction, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    
    interactions = users[uname].setdefault("interactions", {})
    entry = interactions.setdefault(body.title, {
        "user_id": uname,
        "movie_id": body.title,
        "watched": False,
        "wishlist": False,
        "watch_timestamp": 0.0,
        "recommendation_score": 0.0
    })
    entry["watch_timestamp"] = time.time()
    entry["user_id"] = uname
    entry["movie_id"] = body.title
    
    user_auth.save_users(users)
    return {"detail": "View recorded"}

class UploadImageRequest(BaseModel):
    image_base64: str
    type: str

@router.post("/upload")
def upload_image(body: UploadImageRequest, current_user: dict = Depends(get_current_user)):
    import os
    import uuid
    import base64
    uname = current_user["username"]
    image_data = body.image_base64
    
    if not image_data or "," not in image_data:
        raise HTTPException(status_code=400, detail="Invalid image data")
        
    header, encoded = image_data.split(",", 1)
    ext = "jpg"
    if "png" in header: ext = "png"
    elif "webp" in header: ext = "webp"
    elif "jpeg" in header: ext = "jpg"
    elif "mp4" in header: ext = "mp4"
    elif "mov" in header: ext = "mov"
    elif "quicktime" in header: ext = "mov"
    elif "webm" in header: ext = "webm"
    elif "ogg" in header: ext = "ogg"
    
    filename = f"{uname}_{body.type}_{uuid.uuid4().hex}.{ext}"
    os.makedirs("uploads", exist_ok=True)
    filepath = os.path.join("uploads", filename)
    
    with open(filepath, "wb") as f:
        f.write(base64.b64decode(encoded))
        
    return {"url": f"https://novaflix-backend.onrender.com/uploads/{filename}"}
