"""
Celebrity router — list, search, subscribe/unsubscribe directors/actors/actresses.
These are CREATORS (not regular users). Subscription gives 40% boosted recommendations.
"""
from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel
from processing import celebrity_store
from core.deps import get_current_user

router = APIRouter(prefix="/api/celebrities", tags=["celebrities"])


class SubscribeRequest(BaseModel):
    celeb_id: str


@router.get("/list")
def list_celebrities(
    type: str = Query(None, description="Filter by type: director, actor, actress"),
    current_user: dict = Depends(get_current_user)
):
    username = current_user["username"]
    celebs = celebrity_store.get_all_celebrities(celeb_type=type)
    # Mark which ones the user subscribes to
    for c in celebs:
        c["is_subscribed"] = celebrity_store.is_subscribed(username, c["id"])
    return {"celebrities": celebs}


@router.get("/search")
def search_celebrities(
    q: str = Query(..., min_length=1, description="Search query for celebrity name"),
    current_user: dict = Depends(get_current_user)
):
    """Search celebrities by name. Returns results with subscription status."""
    username = current_user["username"]
    results = celebrity_store.search_celebrities(q, username=username)
    return {"query": q, "results": results}


@router.post("/subscribe")
def subscribe(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    success, msg = celebrity_store.subscribe_celebrity(username, req.celeb_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/unsubscribe")
def unsubscribe(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    success, msg = celebrity_store.unsubscribe_celebrity(username, req.celeb_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.get("/subscriptions")
def get_subscriptions(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    subscribed = celebrity_store.get_subscribed_celebrities(username)
    return {"subscriptions": subscribed}


@router.get("/subscriptions/names")
def get_subscription_names(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    names = celebrity_store.get_subscribed_names(username)
    return names


# ── Legacy follow endpoints (kept for backward compatibility) ──────────────────

@router.post("/follow")
def follow(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    success, msg = celebrity_store.subscribe_celebrity(username, req.celeb_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.post("/unfollow")
def unfollow(req: SubscribeRequest, current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    success, msg = celebrity_store.unsubscribe_celebrity(username, req.celeb_id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}


@router.get("/following")
def get_following(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    subscribed = celebrity_store.get_subscribed_celebrities(username)
    return {"following": subscribed}


@router.get("/following/names")
def get_following_names(current_user: dict = Depends(get_current_user)):
    username = current_user["username"]
    names = celebrity_store.get_subscribed_names(username)
    return names
