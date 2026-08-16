import json
import os
import time
import uuid

# Path resolved from config so it works regardless of working directory
try:
    from core.config import get_settings

    SESSIONS_DB = os.path.join(
        os.path.dirname(get_settings().USERS_FILE), "sessions.json"
    )
except Exception:
    SESSIONS_DB = os.path.join(os.path.dirname(__file__), "..", "sessions.json")


def load_sessions():
    if not os.path.exists(SESSIONS_DB):
        return {}
    with open(SESSIONS_DB, "r") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}


def save_sessions(sessions):
    with open(SESSIONS_DB, "w") as f:
        json.dump(sessions, f, indent=4)


def create_session(
    username,
    device="Unknown",
    browser="Unknown",
    os_name="Unknown",
    location="Unknown",
    ip_address="Unknown",
):
    sessions = load_sessions()
    session_id = str(uuid.uuid4())

    sessions[session_id] = {
        "session_id": session_id,
        "username": username,
        "device": device,
        "browser": browser,
        "os": os_name,
        "location": location,
        "ip_address": ip_address,
        "last_active": time.time(),
        "created_at": time.time(),
    }

    save_sessions(sessions)
    return session_id


def get_session(session_id):
    sessions = load_sessions()
    return sessions.get(session_id)


def get_user_sessions(username):
    sessions = load_sessions()
    return [s for s in sessions.values() if s["username"] == username]


def update_session_activity(session_id):
    sessions = load_sessions()
    if session_id in sessions:
        sessions[session_id]["last_active"] = time.time()
        save_sessions(sessions)


def revoke_session(session_id):
    sessions = load_sessions()
    if session_id in sessions:
        del sessions[session_id]
        save_sessions(sessions)
        return True
    return False


def revoke_all_user_sessions(username, except_session_id=None):
    sessions = load_sessions()
    keys_to_delete = []
    for sid, sdata in sessions.items():
        if sdata["username"] == username and sid != except_session_id:
            keys_to_delete.append(sid)

    for sid in keys_to_delete:
        del sessions[sid]

    save_sessions(sessions)


def update_username_in_sessions(old_username, new_username):
    sessions = load_sessions()
    for sid, sdata in sessions.items():
        if sdata["username"] == old_username:
            sdata["username"] = new_username
    save_sessions(sessions)


def cleanup_old_sessions(max_age_seconds=7776000):  # 90 days
    """Clean up sessions that haven't been active for more than max_age_seconds."""
    sessions = load_sessions()
    current_time = time.time()
    sessions_to_delete = []

    for sid, sdata in sessions.items():
        last_active = sdata.get("last_active", sdata.get("created_at", 0))
        age = current_time - last_active
        if age > max_age_seconds:
            sessions_to_delete.append(sid)

    for sid in sessions_to_delete:
        del sessions[sid]

    if sessions_to_delete:
        save_sessions(sessions)

    return len(sessions_to_delete)
