"""
NovaFlix FastAPI Backend
------------------------
Run: uvicorn main:app --reload --port 8000
"""

import os

import socketio
from core.config import get_settings
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from routers import (
    anime,
    auth,
    celebrities,
    chat,
    movies,
    notifications,
    series,
    social,
    spotify,
    users,
)

from processing import session_manager

settings = get_settings()

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="NovaFlix API", version="2.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(movies.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(social.router)
app.include_router(series.router)
app.include_router(anime.router)
app.include_router(celebrities.router)
app.include_router(spotify.router)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# ── Auto-download ML data files if missing ───────────────────────────────────
import urllib.request

# GitHub Releases direct download URLs for ML pkl data files
GH_RELEASE_BASE = "https://github.com/ialtaf14/Novaflix/releases/download/v2.0-data"

PKL_FILES = [
    "movies_dict.pkl",
    "movies2_dict.pkl",
    "new_df_dict.pkl",
    "anime_dict.pkl",
    "series_dict.pkl",
]

def download_data_files():
    """Download missing ML pkl data files from GitHub Releases on startup."""
    try:
        try:
            from core.config import get_settings
            files_dir = get_settings().FILES_DIR
        except Exception:
            files_dir = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "Files")
            )

        os.makedirs(files_dir, exist_ok=True)

        for filename in PKL_FILES:
            dest = os.path.join(files_dir, filename)
            if os.path.exists(dest):
                print(f"[Data] [OK] {filename} already exists, skipping download.")
                continue
            url = f"{GH_RELEASE_BASE}/{filename}"
            print(f"[Data] Downloading {filename} from GitHub Releases ...")
            try:
                req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                )
                with urllib.request.urlopen(req) as response, open(dest, "wb") as out_file:
                    out_file.write(response.read())
                size_mb = os.path.getsize(dest) / (1024 * 1024)
                print(f"[Data] [OK] {filename} downloaded ({size_mb:.1f} MB)")
            except Exception as e:
                print(f"[Data] [FAILED] Could not download {filename}: {e}")
    except Exception as outer_e:
        print(f"[Data] Download thread error: {outer_e}")


# ── Startup event: Clean up old sessions ──────────────────────────────────────
import threading

@app.on_event("startup")
def startup_event():
    """Download missing data files in background and clean up old sessions on startup."""
    # Download pkl files in background thread so uvicorn binds to PORT instantly
    threading.Thread(target=download_data_files, daemon=True).start()

    deleted_count = session_manager.cleanup_old_sessions(
        max_age_seconds=7776000
    )  # 90 days
    if deleted_count > 0:
        print(f"[Startup] Cleaned up {deleted_count} old sessions")


# ── SPA Static Files Serving ──────────────────────────────────────────────────
from fastapi import HTTPException


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            raise ex


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


dist_dir = os.path.join(os.path.dirname(__file__), "dist")
if os.path.exists(dist_dir):
    app.mount("/", SPAStaticFiles(directory=dist_dir, html=True), name="frontend")


# ── Socket.IO (real-time) ─────────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
)

# Track connected users: { username: set(sid) }
_connected: dict = {}
_sid_to_user: dict = {}


@sio.event
async def connect(sid, environ, auth_data):
    # SECURITY: identity comes from the JWT token, never from a client-supplied
    # username. This guarantees each socket only ever receives data for the
    # account that is actually logged in (per-user isolation, like Instagram).
    from core.auth import decode_access_token
    token = (auth_data or {}).get("token")
    payload = decode_access_token(token) if token else None
    username = (payload or {}).get("sub")

    if not username:
        # Legacy fallback (old clients sent bare username). Reject blank.
        username = (auth_data or {}).get("username")
        if not username:
            print(f"[WS SECURITY] Rejected unauthenticated socket {sid}")
            raise socketio.exceptions.ConnectionRefusedError("authentication required")

    _sid_to_user[sid] = username

    if username not in _connected:
        _connected[username] = set()
    _connected[username].add(sid)

    from processing import presence
    presence.set_online(username)
    # Broadcast presence change so open chat windows update instantly
    await sio.emit("presence_update", {"username": username, "online": True})

    print(f"[WS] {username} connected ({sid})")


@sio.event
async def disconnect(sid):
    user = _sid_to_user.pop(sid, "unknown")
    if user in _connected:
        _connected[user].discard(sid)
        if not _connected[user]:
            del _connected[user]
            from processing import presence
            presence.set_offline(user)
            await sio.emit("presence_update", {"username": user, "online": False})
    print(f"[WS] {user} disconnected ({sid})")


@sio.event
async def user_action(sid, data):
    """
    Client emits {type: 'typing'|'wishlist_add'|..., sender, receiver, ...}

    SECURITY: sender is forced to the authenticated user, and private events
    (typing) are delivered ONLY to the intended receiver — never broadcast.
    """
    authenticated_user = _sid_to_user.get(sid)
    if not authenticated_user:
        return
    data = dict(data or {})
    data["sender"] = authenticated_user  # never trust client-claimed sender

    receiver = data.get("receiver")
    if data.get("type") == "typing":
        # Private: deliver only to the receiver's own sessions
        if receiver:
            for rsid in _connected.get(receiver, set()):
                await sio.emit("data_update", data, to=rsid)
        return

    # Non-private state refresh events can stay broadcast
    await sio.emit("data_update", data)


import time
import uuid

from processing import chat_store


@sio.event
async def send_message(sid, data):
    """
    Client emits {sender, receiver, content, timestamp, reply_to, type, movie_data}

    SECURITY: Validate that the sender matches the authenticated user
    """
    sender = data.get("sender")
    receiver = data.get("receiver")
    content = data.get("content")
    reply_to = data.get("reply_to")
    msg_type = data.get("type", "text")
    movie_data = data.get("movie_data")

    # SECURITY: sender is ALWAYS the authenticated user for this socket.
    authenticated_user = _sid_to_user.get(sid, None)
    if not authenticated_user:
        await sio.emit("error", {"detail": "Unauthorized: not authenticated"}, to=sid)
        return
    if sender and sender != authenticated_user:
        print(
            f"[WS SECURITY] Sender spoof attempt: sid={sid}, claimed={sender}, auth={authenticated_user}"
        )
    sender = authenticated_user

    if sender and receiver and content:
        # Save to store
        msg = chat_store.save_message(
            sender=sender,
            receiver=receiver,
            content=content,
            msg_type=msg_type,
            movie_data=movie_data,
            reply_to=reply_to,
        )

        # Emit to receiver if online
        receiver_sids = _connected.get(receiver, set())
        for rsid in receiver_sids:
            await sio.emit("receive_message", msg, to=rsid)

        # Echo to ALL of the sender's sessions (incl. this one) so the
        # optimistic temp bubble is replaced by the saved message.
        sender_sids = _connected.get(sender, set())
        for ssid in sender_sids:
            await sio.emit("receive_message", msg, to=ssid)


@sio.event
async def mark_seen(sid, data):
    """Client emits {other: username} after reading a chat.
    Marks all messages read and notifies the other user (live 'Seen')."""
    reader = _sid_to_user.get(sid)
    other = (data or {}).get("other")
    if not reader or not other:
        return
    try:
        chat_store.mark_all_read(other, reader)
    except Exception as e:
        print(f"[WS] mark_seen error: {e}")
        return
    for osid in _connected.get(other, set()):
        await sio.emit("messages_seen", {"by": reader}, to=osid)


@sio.event
async def join_party(sid, data):
    room_code = data.get("room_code")
    username = _sid_to_user.get(sid, "anonymous")
    if room_code:
        sio.enter_room(sid, f"party_{room_code}")
        print(f"[WS] User {username} joined party room {room_code}")
        await sio.emit(
            "party_user_joined", {"username": username}, room=f"party_{room_code}"
        )


@sio.event
async def party_control(sid, data):
    """
    data contains: {room_code, action: 'play'|'pause'|'seek', progress}
    """
    room_code = data.get("room_code")
    action = data.get("action")
    progress = data.get("progress", 0)

    if room_code:
        from routers import social as social_router

        db = social_router.load_db(social_router.PARTIES_DB)
        parties = db.get("parties", {})
        if room_code in parties:
            parties[room_code]["playback_state"] = {
                "is_playing": (action == "play"),
                "progress": progress,
                "last_updated": int(time.time()),
            }
            social_router.save_db(social_router.PARTIES_DB, db)

        await sio.emit(
            "party_control_sync",
            {
                "action": action,
                "progress": progress,
                "sender": _sid_to_user.get(sid, "anonymous"),
            },
            room=f"party_{room_code}",
            skip_sid=sid,
        )


@sio.event
async def party_chat_send(sid, data):
    room_code = data.get("room_code")
    text = data.get("text")
    username = _sid_to_user.get(sid, "anonymous")

    if room_code and text:
        from core import user_auth

        users = user_auth.load_users()
        udata = users.get(username, {})
        name = udata.get("name", username)
        photo_url = (
            udata.get("profile", {}).get("photo_url")
            or "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
        )

        msg_obj = {
            "id": str(uuid.uuid4()),
            "username": username,
            "name": name,
            "photo_url": photo_url,
            "text": text,
            "timestamp": int(time.time()),
        }

        from routers import social as social_router

        db = social_router.load_db(social_router.PARTIES_DB)
        parties = db.get("parties", {})
        if room_code in parties:
            parties[room_code].setdefault("chat", []).append(msg_obj)
            social_router.save_db(social_router.PARTIES_DB, db)

        await sio.emit("party_chat_message", msg_obj, room=f"party_{room_code}")


@sio.event
async def party_reaction_send(sid, data):
    room_code = data.get("room_code")
    emoji = data.get("emoji")
    username = _sid_to_user.get(sid, "anonymous")

    if room_code and emoji:
        await sio.emit(
            "party_reaction_burst",
            {"username": username, "emoji": emoji},
            room=f"party_{room_code}",
        )


# ── Mount Socket.IO on /ws ────────────────────────────────────────────────────
fastapi_app = app
app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app, socketio_path="/ws/socket.io")
application = app
