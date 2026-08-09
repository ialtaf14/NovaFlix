"""
Chat/Messages router — Instagram DM-style messaging API.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.deps import get_current_user
from processing import chat_store, auth as user_auth, presence

router = APIRouter(prefix="/api/chat", tags=["chat"])

FALLBACK = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"

class SendMessageBody(BaseModel):
    content: str
    type: str = "text"          # text | movie | image | gif
    movie_data: Optional[dict] = None
    reply_to: Optional[str] = None

class ReactionBody(BaseModel):
    emoji: str   # empty string = remove reaction

class PinBody(BaseModel):
    pass

class EditMessageBody(BaseModel):
    content: str

# ── Conversations List ────────────────────────────────────────────────────────

@router.get("/conversations")
def get_conversations(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    users = user_auth.load_users()

    convs = chat_store.get_conversations_list(uname)

    # Enrich with profile info, filtering out conversations with deleted users
    enriched = []
    for c in convs:
        other = c["username"]
        u_info = users.get(other)
        if not u_info:
            # User was deleted — remove the conversation
            chat_store.delete_conversation(uname, other)
            continue
        enriched.append({
            **c,
            "name": u_info.get("name", other),
            "photo_url": u_info.get("profile", {}).get("photo_url") or FALLBACK,
            "online": presence.is_online(other),
            "last_seen": presence.get_last_seen(other),
        })
    return {"conversations": enriched}

# ── Conversation Messages ─────────────────────────────────────────────────────

@router.get("/{target_username}")
def get_chat_history(target_username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    
    # Authorization: verify user is a member of this conversation
    conv_id = chat_store._conv_key(uname, target_username)
    conn = chat_store.get_db()
    c = conn.cursor()
    c.execute("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, uname))
    if not c.fetchone():
        # Not a member — return empty (don't reveal if conversation exists)
        users = user_auth.load_users()
        other_info = users.get(target_username, {})
        return {
            "messages": [],
            "other_user": {
                "username": target_username,
                "name": other_info.get("name", target_username),
                "photo_url": other_info.get("profile", {}).get("photo_url") or FALLBACK,
                "online": False,
            }
        }
    
    users = user_auth.load_users()
    messages = chat_store.get_conversation(uname, target_username)

    other_info = users.get(target_username, {})
    return {
        "messages": messages,
        "other_user": {
            "username": target_username,
            "name": other_info.get("name", target_username),
            "photo_url": other_info.get("profile", {}).get("photo_url") or FALLBACK,
            "online": False,
        }
    }

# ── Read Receipts ──────────────────────────────────────────────────────────────

@router.post("/mark-all-read/{target_username}")
def mark_all_read(target_username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    chat_store.mark_all_read(target_username, uname)
    return {"detail": "Marked all read"}

@router.post("/mark-read/{msg_id}")
def mark_message_read(msg_id: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    chat_store.mark_read(msg_id, uname)
    return {"detail": "Message marked read"}

# ── Send Message ──────────────────────────────────────────────────────────────

@router.post("/{target_username}/send")
def send_message(
    target_username: str,
    body: SendMessageBody,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    msg = chat_store.save_message(
        sender=uname,
        receiver=target_username,
        content=body.content,
        msg_type=body.type,
        movie_data=body.movie_data,
        reply_to=body.reply_to
    )
    from processing import activity_store
    activity_store.log_activity(uname, "message_send", other_user=target_username)
    return {"message": msg}

# ── Reactions ─────────────────────────────────────────────────────────────────

@router.post("/{target_username}/react/{msg_id}")
def react_to_message(
    target_username: str,
    msg_id: str,
    body: ReactionBody,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.add_reaction(uname, target_username, msg_id, uname, body.emoji)
    return {"detail": "Reaction updated"}

# ── Edit Message ──────────────────────────────────────────────────────────────

@router.put("/{target_username}/message/{msg_id}")
def edit_message(
    target_username: str,
    msg_id: str,
    body: EditMessageBody,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.edit_message(uname, target_username, msg_id, uname, body.content)
    return {"detail": "Message edited"}

# ── Delete Message ────────────────────────────────────────────────────────────

@router.delete("/{target_username}/message/{msg_id}")
def delete_message(
    target_username: str,
    msg_id: str,
    for_everyone: bool = False,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.delete_message(uname, target_username, msg_id, uname, for_everyone=for_everyone)
    return {"detail": "Message deleted"}

# ── Clear Chat ────────────────────────────────────────────────────────────────

@router.post("/{target_username}/clear")
def clear_chat(
    target_username: str,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.clear_chat(uname, target_username, uname)
    return {"detail": "Chat cleared"}

@router.delete("/{target_username}")
def delete_conversation_route(
    target_username: str,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.clear_chat(uname, target_username, uname)
    return {"detail": "Conversation deleted"}

# ── Star Message ──────────────────────────────────────────────────────────────

@router.post("/{target_username}/star/{msg_id}")
def toggle_star(
    target_username: str,
    msg_id: str,
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    chat_store.toggle_star_message(uname, target_username, msg_id, uname)
    return {"detail": "Star toggled"}

# ── Pin/Unpin Conversation ────────────────────────────────────────────────────

@router.post("/{target_username}/pin")
def toggle_pin(target_username: str, current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    chat_store.toggle_pin(uname, target_username, uname)
    return {"detail": "Pin toggled"}
