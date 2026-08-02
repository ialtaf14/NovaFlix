"""
Notifications router — Instagram-style notifications API.
"""
from fastapi import APIRouter, Depends, Body
from core.deps import get_current_user
from processing import notif_store, auth as user_auth

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

FALLBACK = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"

@router.get("")
def get_notifications(category: str = "All", current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    notifs = notif_store.get_user_notifications(uname)
    
    # Filter by category
    if category != "All":
        filtered = []
        for n in notifs:
            ntype = n.get("type", "").lower()
            if category == "Following" and ntype == "follow":
                filtered.append(n)
            elif category == "Reviews" and ntype in ("review", "comment", "reply"):
                filtered.append(n)
            elif category == "Movies" and ntype in ("movie", "recommendation"):
                filtered.append(n)
            elif category == "Mentions" and ntype == "mention":
                filtered.append(n)
            elif category == "Likes" and ntype == "like":
                filtered.append(n)
            elif category == "System" and ntype == "system":
                filtered.append(n)
        notifs = filtered
        
    unread = sum(1 for n in notifs if not n.get("read", False))
    return {"notifications": notifs, "unread_count": unread}

@router.get("/unread-count")
def unread_count(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    return {"count": notif_store.get_unread_count(uname)}

@router.post("/mark-all-read")
def mark_all_read(current_user: dict = Depends(get_current_user)):
    notif_store.mark_all_read(current_user["username"])
    return {"detail": "All marked as read"}

@router.post("/mark-read/{notif_id}")
def mark_one_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    notif_store.mark_one_read(current_user["username"], notif_id)
    return {"detail": "Marked as read"}
