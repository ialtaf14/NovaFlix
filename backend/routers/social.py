import os
import json
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Optional
from routers.auth import get_current_user
from processing import auth as user_auth
from processing import preprocess, ai_assistant, activity_store

router = APIRouter(prefix="/api/social", tags=["social"])

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "Files")
STORIES_DB = os.path.join(DATA_DIR, "stories.json")
COLLECTIONS_DB = os.path.join(DATA_DIR, "collections.json")
PARTIES_DB = os.path.join(DATA_DIR, "parties.json")

# Helper loading/saving functions
def load_db(file_path):
    if not os.path.exists(file_path):
        return {}
    with open(file_path, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_db(file_path, data):
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)

# ──────────────────────────────────────────────────────────────────────────────
# 1. STORIES / STATUS SYSTEM
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/stories")
def create_story(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """
    Share a story.
    Type can be: 'poster' | 'review' | 'rating' | 'image' | 'text'
    """
    uname = current_user["username"]
    db = load_db(STORIES_DB)
    stories_list = db.setdefault("stories", [])
    
    # Calculate user details
    users = user_auth.load_users()
    udata = users.get(uname, {})
    name = udata.get("name", uname)
    photo_url = udata.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"

    story_id = str(uuid.uuid4())
    story_obj = {
        "id": story_id,
        "username": uname,
        "name": name,
        "photo_url": photo_url,
        "type": body.get("type", "text"),
        "content": body.get("content", ""), # image URL, movie poster URL, etc.
        "movie_title": body.get("movie_title"),
        "rating": body.get("rating"),
        "year": body.get("year"),
        "timestamp": int(time.time()),
        "text": body.get("text", ""),
        "emoji": body.get("emoji", ""),
        "stickers": body.get("stickers", []),
        "mentions": body.get("mentions", []),
        "hashtags": body.get("hashtags", []),
        "overlays": body.get("overlays", []),
        "background_color": body.get("background_color", ""),
        "likes": [],
        "replies": [],
        "reactions": [],
        "viewers": []
    }
    
    stories_list.append(story_obj)
    save_db(STORIES_DB, db)
    
    # Log activity & award XP (+15 for story sharing)
    activity_store.log_activity(uname, "story_share", movie_title=body.get("movie_title"), metadata={"story_id": story_id})
    
    # Return active list
    return {"status": "success", "story": story_obj}

@router.get("/stories")
def get_stories(current_user: dict = Depends(get_current_user)):
    """
    Get active stories of followed users (< 24 hours old).
    Returns grouped list of user circles.
    """
    uname = current_user["username"]
    users = user_auth.load_users()
    udata = users.get(uname, {})
    following = set(udata.get("following", []))
    following.add(uname) # Include own stories
    
    # Check blocked users
    blocked = set(udata.get("safety", {}).get("blocked", []))
    
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    now = int(time.time())
    one_day = 24 * 60 * 60
    
    # Filter active and relevant stories
    active_stories = []
    for s in stories_list:
        if now - s["timestamp"] < one_day:
            if s["username"] in following and s["username"] not in blocked:
                active_stories.append(s)
                
    # Group stories by username
    grouped = {}
    for s in active_stories:
        user_stories = grouped.setdefault(s["username"], {
            "username": s["username"],
            "name": s["name"],
            "photo_url": s["photo_url"],
            "stories": []
        })
        user_stories["stories"].append(s)

    result = list(grouped.values())
    for g in result:
        # Oldest → newest inside a user's story reel (Instagram order)
        g["stories"].sort(key=lambda x: x["timestamp"])
        # Has the current user seen every story of this person? (ring state)
        g["all_seen"] = all(
            any(v.get("username") == uname for v in s.get("viewers", []))
            for s in g["stories"]
        )
        g["latest_timestamp"] = g["stories"][-1]["timestamp"]

    # Own story first, then unseen (newest first), then seen
    result.sort(key=lambda g: (
        g["username"] != uname,
        g["all_seen"],
        -g["latest_timestamp"],
    ))
    return result

@router.post("/stories/{story_id}/like")
def like_story(story_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    for s in stories_list:
        if s["id"] == story_id:
            likes = s.setdefault("likes", [])
            if uname in likes:
                likes.remove(uname)
                status = "unliked"
            else:
                likes.append(uname)
                status = "liked"
                
                # Notification to story owner
                if s["username"] != uname:
                    from processing import notif_store
                    actor_photo = current_user.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
                    notif_store.add_notification(
                        recipient=s["username"],
                        notif_type="like",
                        actor=uname,
                        actor_photo=actor_photo,
                        text=f"{current_user.get('name', uname)} liked your story."
                    )
            save_db(STORIES_DB, db)
            return {"status": "success", "action": status, "likes": likes}
            
    raise HTTPException(status_code=404, detail="Story not found")

@router.post("/stories/{story_id}/react")
def react_story(story_id: str, body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    emoji = body.get("emoji", "🔥")
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    for s in stories_list:
        if s["id"] == story_id:
            reactions = s.setdefault("reactions", [])
            # remove old if any
            s["reactions"] = [r for r in reactions if r["username"] != uname]
            s["reactions"].append({"username": uname, "emoji": emoji})
            save_db(STORIES_DB, db)

            # Instagram-style: reaction lands in the owner's DM + notification
            if s["username"] != uname:
                from processing import chat_store, notif_store
                label = s.get("movie_title") or s.get("text") or "your story"
                chat_store.save_message(
                    uname, s["username"],
                    f"{emoji} Reacted to your story ({label})",
                    msg_type="story_reaction",
                )
                actor_photo = current_user.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
                notif_store.add_notification(
                    recipient=s["username"],
                    notif_type="like",
                    actor=uname,
                    actor_photo=actor_photo,
                    text=f"{current_user.get('name', uname)} reacted {emoji} to your story."
                )
            return {"status": "success", "reactions": s["reactions"]}
            
    raise HTTPException(status_code=404, detail="Story not found")

@router.post("/stories/{story_id}/reply")
def reply_story(story_id: str, body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Reply text is empty")
        
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    for s in stories_list:
        if s["id"] == story_id:
            replies = s.setdefault("replies", [])
            users = user_auth.load_users()
            udata = users.get(uname, {})
            name = udata.get("name", uname)
            photo = udata.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
            
            reply_obj = {
                "id": str(uuid.uuid4()),
                "username": uname,
                "name": name,
                "photo_url": photo,
                "text": text,
                "timestamp": int(time.time())
            }
            replies.append(reply_obj)
            save_db(STORIES_DB, db)

            # Story reply lands in the owner's DMs (Instagram behaviour)
            from processing import chat_store, notif_store
            if s["username"] != uname:
                chat_store.save_message(
                    uname, s["username"],
                    f"💬 Replied to your story: \"{text}\"",
                    msg_type="story_reply",
                )
                notif_store.add_notification(
                    recipient=s["username"],
                    notif_type="comment",
                    actor=uname,
                    actor_photo=photo,
                    text=f"{name} replied to your story: {text[:60]}"
                )

            return {"status": "success", "reply": reply_obj}
            
    raise HTTPException(status_code=404, detail="Story not found")

@router.post("/stories/{story_id}/view")
def view_story(story_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    for s in stories_list:
        if s["id"] == story_id:
            viewers = s.setdefault("viewers", [])
            # check if user already viewed
            if not any(v["username"] == uname for v in viewers):
                users = user_auth.load_users()
                udata = users.get(uname, {})
                viewers.append({
                    "username": uname,
                    "name": udata.get("name", uname),
                    "photo_url": udata.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
                    "timestamp": int(time.time())
                })
                save_db(STORIES_DB, db)
            return {"status": "success", "viewers": viewers, "seen_count": len(viewers)}
            
    raise HTTPException(status_code=404, detail="Story not found")

@router.delete("/stories/{story_id}")
def delete_story(story_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(STORIES_DB)
    stories_list = db.get("stories", [])
    
    for idx, s in enumerate(stories_list):
        if s["id"] == story_id:
            if s["username"] != uname:
                raise HTTPException(status_code=403, detail="Not authorized to delete this story")
            stories_list.pop(idx)
            save_db(STORIES_DB, db)
            return {"status": "success", "message": "Story deleted successfully"}
            
    raise HTTPException(status_code=404, detail="Story not found")

# ──────────────────────────────────────────────────────────────────────────────
# 2. MOVIE COLLECTION SYSTEM
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/collections")
def create_collection(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Collection title is required")
        
    db = load_db(COLLECTIONS_DB)
    cols = db.setdefault("collections", [])
    
    col_id = str(uuid.uuid4())
    col_obj = {
        "id": col_id,
        "creator_username": uname,
        "creator_name": current_user.get("name", uname),
        "creator_photo": current_user.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
        "title": title,
        "description": body.get("description", ""),
        "is_public": body.get("is_public", True),
        "cover_image": body.get("cover_image") or "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80",
        "movies": body.get("movies", []),
        "likes": [],
        "followers": [],
        "timestamp": int(time.time())
    }
    cols.append(col_obj)
    save_db(COLLECTIONS_DB, db)
    
    # Log activity & award XP (+20 for collection creation)
    activity_store.log_activity(uname, "list_create", metadata={"collection_id": col_id, "title": title})
    
    return {"status": "success", "collection": col_obj}

@router.get("/collections")
def get_collections(current_user: dict = Depends(get_current_user)):
    """Fetch public collections and private collections owned by current user."""
    uname = current_user["username"]
    db = load_db(COLLECTIONS_DB)
    cols = db.get("collections", [])
    
    users = user_auth.load_users()
    udata = users.get(uname, {})
    blocked = set(udata.get("safety", {}).get("blocked", []))
    
    visible = []
    for c in cols:
        if c["creator_username"] not in blocked:
            if c["is_public"] or c["creator_username"] == uname:
                visible.append(c)
                
    return visible

@router.put("/collections/{col_id}")
def update_collection(col_id: str, body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(COLLECTIONS_DB)
    cols = db.get("collections", [])
    
    for c in cols:
        if c["id"] == col_id:
            if c["creator_username"] != uname:
                raise HTTPException(status_code=403, detail="Not authorized to edit this collection")
                
            c["title"] = body.get("title", c["title"])
            c["description"] = body.get("description", c["description"])
            c["is_public"] = body.get("is_public", c["is_public"])
            c["cover_image"] = body.get("cover_image", c["cover_image"])
            c["movies"] = body.get("movies", c["movies"])
            
            save_db(COLLECTIONS_DB, db)
            return {"status": "success", "collection": c}
            
    raise HTTPException(status_code=404, detail="Collection not found")

@router.delete("/collections/{col_id}")
def delete_collection(col_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(COLLECTIONS_DB)
    cols = db.get("collections", [])
    
    for idx, c in enumerate(cols):
        if c["id"] == col_id:
            if c["creator_username"] != uname:
                raise HTTPException(status_code=403, detail="Not authorized to delete this collection")
            cols.pop(idx)
            save_db(COLLECTIONS_DB, db)
            return {"status": "success", "message": "Collection deleted"}
            
    raise HTTPException(status_code=404, detail="Collection not found")

@router.post("/collections/{col_id}/like")
def like_collection(col_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(COLLECTIONS_DB)
    cols = db.get("collections", [])
    
    for c in cols:
        if c["id"] == col_id:
            likes = c.setdefault("likes", [])
            if uname in likes:
                likes.remove(uname)
                status = "unliked"
            else:
                likes.append(uname)
                status = "liked"
            save_db(COLLECTIONS_DB, db)
            return {"status": "success", "action": status, "likes": likes}
            
    raise HTTPException(status_code=404, detail="Collection not found")

@router.post("/collections/{col_id}/follow")
def follow_collection(col_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    db = load_db(COLLECTIONS_DB)
    cols = db.get("collections", [])
    
    for c in cols:
        if c["id"] == col_id:
            followers = c.setdefault("followers", [])
            if uname in followers:
                followers.remove(uname)
                status = "unfollowed"
            else:
                followers.append(uname)
                status = "followed"
            save_db(COLLECTIONS_DB, db)
            return {"status": "success", "action": status, "followers": followers}
            
    raise HTTPException(status_code=404, detail="Collection not found")

# ──────────────────────────────────────────────────────────────────────────────
# 3. WATCH PARTY ROOMS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/party/create")
def create_party(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    movie_title = body.get("movie_title")
    if not movie_title:
        raise HTTPException(status_code=400, detail="Movie title is required for watch party")
        
    db = load_db(PARTIES_DB)
    parties = db.setdefault("parties", {})
    
    # Generate random 6-character room code
    import random
    import string
    room_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    
    # Get movie details for poster
    details = preprocess.get_movie_details(movie_title)
    
    party_obj = {
        "code": room_code,
        "host": uname,
        "movie_title": movie_title,
        "movie_poster": details.get("poster", ""),
        "members": [{
            "username": uname,
            "name": current_user.get("name", uname),
            "photo_url": current_user.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
            "is_voice_connected": True,
            "is_muted": False
        }],
        "playback_state": {
            "is_playing": False,
            "progress": 0,
            "last_updated": int(time.time())
        },
        "chat": [],
        "timestamp": int(time.time())
    }
    
    parties[room_code] = party_obj
    save_db(PARTIES_DB, db)
    return party_obj

@router.post("/party/join")
def join_party(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    room_code = body.get("room_code", "").strip().upper()
    if not room_code:
        raise HTTPException(status_code=400, detail="Room code is required")
        
    db = load_db(PARTIES_DB)
    parties = db.get("parties", {})
    
    if room_code not in parties:
        raise HTTPException(status_code=404, detail="Watch Party room not found")
        
    party = parties[room_code]
    members = party.setdefault("members", [])
    
    # check if already member
    if not any(m["username"] == uname for m in members):
        members.append({
            "username": uname,
            "name": current_user.get("name", uname),
            "photo_url": current_user.get("profile", {}).get("photo_url") or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png",
            "is_voice_connected": False,
            "is_muted": False
        })
        save_db(PARTIES_DB, db)
        
    return party

@router.get("/party/{room_code}")
def get_party(room_code: str, current_user: dict = Depends(get_current_user)):
    db = load_db(PARTIES_DB)
    parties = db.get("parties", {})
    if room_code not in parties:
        raise HTTPException(status_code=404, detail="Room not found")
    return parties[room_code]

# ──────────────────────────────────────────────────────────────────────────────
# 4. GAMIFICATION / ACHIEVEMENTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/gamification")
def get_gamification(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    
    # Retrieve user stats from activities
    stats = activity_store.get_stats(uname)
    movies_watched = stats["all_time"]["movies_watched"]
    reviews_written = stats["all_time"]["reviews_written"]
    
    # Calculate custom collection counts
    col_db = load_db(COLLECTIONS_DB)
    cols = col_db.get("collections", [])
    user_cols_count = sum(1 for c in cols if c["creator_username"] == uname)
    
    # Follow count
    users = user_auth.load_users()
    udata = users.get(uname, {})
    following_count = len(udata.get("following", []))

    # Calculate XP dynamically based on criteria
    # Watch movie: +10 XP, review: +5 XP, follow: +2 XP, complete collection: +20 XP
    xp = (movies_watched * 10) + (reviews_written * 5) + (following_count * 2) + (user_cols_count * 20)
    
    # Level calculations: every 100 XP is 1 level
    level = min(100, max(1, (xp // 100) + 1))
    level_xp_progress = xp % 100

    # Calculate badges
    badges = [
        {"id": "explorer", "name": "Movie Explorer", "desc": "Watch 5+ movies", "completed": movies_watched >= 5, "current": movies_watched, "target": 5},
        {"id": "scifi", "name": "Sci-Fi Master", "desc": "Watch 3+ Sci-Fi movies", "completed": False, "current": 0, "target": 3},
        {"id": "horror", "name": "Horror King", "desc": "Watch 3+ Horror movies", "completed": False, "current": 0, "target": 3},
        {"id": "nolan", "name": "Nolan Fan", "desc": "Watch 2+ Nolan movies", "completed": False, "current": 0, "target": 2},
        {"id": "reviewer", "name": "Reviewer Pro", "desc": "Write 5+ reviews", "completed": reviews_written >= 5, "current": reviews_written, "target": 5},
        {"id": "critic", "name": "Movie Critic", "desc": "Write 10+ reviews", "completed": reviews_written >= 10, "current": reviews_written, "target": 10},
        {"id": "col_master", "name": "Collection Master", "desc": "Create 3+ collections", "completed": user_cols_count >= 3, "current": user_cols_count, "target": 3}
    ]

    # Calculate specific genres/directors from rec_profile
    rec_profile = stats.get("rec_profile", {})
    
    # SciFi Master check
    scifi_count = 0
    # Search watched movies genres
    df = preprocess.load_movies_df()
    watched_titles = udata.get("watched_list", [])
    if df is not None:
        for t in watched_titles:
            row = df[df["title"] == t]
            if not row.empty:
                genres = row.iloc[0].get("genres", [])
                if "Sci-Fi" in genres or "Science Fiction" in genres:
                    scifi_count += 1
                    
    for b in badges:
        if b["id"] == "scifi":
            b["current"] = scifi_count
            b["completed"] = scifi_count >= b["target"]
            
    # Horror King check
    horror_count = 0
    if df is not None:
        for t in watched_titles:
            row = df[df["title"] == t]
            if not row.empty:
                genres = row.iloc[0].get("genres", [])
                if "Horror" in genres:
                    horror_count += 1
                    
    for b in badges:
        if b["id"] == "horror":
            b["current"] = horror_count
            b["completed"] = horror_count >= b["target"]

    # Nolan Fan check
    nolan_count = 0
    if df is not None:
        for t in watched_titles:
            row = df[df["title"] == t]
            if not row.empty:
                dirs = row.iloc[0].get("director", [])
                if "Christopher Nolan" in dirs or (isinstance(dirs, str) and "Christopher Nolan" in dirs):
                    nolan_count += 1
                    
    for b in badges:
        if b["id"] == "nolan":
            b["current"] = nolan_count
            b["completed"] = nolan_count >= b["target"]

    return {
        "xp": xp,
        "level": level,
        "level_xp_progress": level_xp_progress,
        "badges": badges,
        "watched_count": movies_watched,
        "reviews_count": reviews_written,
        "collections_count": user_cols_count
    }

# ──────────────────────────────────────────────────────────────────────────────
# 5. AI ASSISTANT & MOODS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/ai/chat")
def chat_ai(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    query = body.get("message", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query message is required")
        
    # Award +2 XP for asking AI
    activity_store.log_activity(uname, "ai_query", metadata={"query": query})
    
    suggestions = ai_assistant.answer_ai_query(uname, query)
    return {
        "reply": f"Here are some great movie recommendations fitting your description:",
        "suggestions": suggestions
    }

@router.get("/ai/moods")
def get_moods(
    mood: str = Query(...),
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    suggestions = ai_assistant.get_mood_recommendations(uname, mood, limit=limit, offset=offset)
    return suggestions

# ──────────────────────────────────────────────────────────────────────────────
# 6. SAFETY / ACCOUNT PRIVACY SETTINGS
# ──────────────────────────────────────────────────────────────────────────────

@router.post("/safety/block")
def block_user(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    target = body.get("target_username")
    action = body.get("action", "block") # block | mute | restrict_comment
    
    if uname == target:
        raise HTTPException(status_code=400, detail="Cannot apply safety controls on yourself")
        
    users = user_auth.load_users()
    if target not in users:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    udata = users.get(uname, {})
    safety = udata.setdefault("safety", {})
    
    if action == "block":
        blocked_list = safety.setdefault("blocked", [])
        if target in blocked_list:
            blocked_list.remove(target)
            msg = f"Unblocked {target}"
        else:
            blocked_list.append(target)
            msg = f"Blocked {target}"
    elif action == "mute":
        muted_list = safety.setdefault("muted", [])
        if target in muted_list:
            muted_list.remove(target)
            msg = f"Unmuted {target}"
        else:
            muted_list.append(target)
            msg = f"Muted {target}"
    elif action == "restrict_comment":
        restricted_list = safety.setdefault("restricted_comment", [])
        if target in restricted_list:
            restricted_list.remove(target)
            msg = f"Unrestricted comment from {target}"
        else:
            restricted_list.append(target)
            msg = f"Restricted comment from {target}"
            
    user_auth.save_users(users)
    return {"status": "success", "message": msg, "safety": safety}

@router.put("/safety/settings")
def update_safety_settings(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()
    udata = users.get(uname, {})
    
    safety = udata.setdefault("safety", {})
    safety["private_account"] = body.get("private_account", safety.get("private_account", False))
    safety["age_restriction"] = body.get("age_restriction", safety.get("age_restriction", "None")) # None | 13+ | 17+
    safety["hidden_words"] = body.get("hidden_words", safety.get("hidden_words", []))
    
    user_auth.save_users(users)
    return {"status": "success", "safety": safety}
