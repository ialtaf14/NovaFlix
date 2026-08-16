"""
FastAPI dependency: get_current_user
Validates JWT from Authorization: Bearer <token> header.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.auth import decode_access_token
from processing import auth as user_auth
from processing import session_manager

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username: str = payload.get("sub")
    session_id: str = payload.get("session_id")

    if not username:
        raise HTTPException(status_code=401, detail="Token missing subject")

    users = user_auth.load_users()
    if username not in users:
        raise HTTPException(status_code=401, detail="User not found")

    # ── Session restoration ─────────────────────────────────────────────────
    # If the JWT is valid but the session record is missing (e.g. backend was
    # restarted and sessions.json was wiped), automatically recreate the
    # session so the user stays logged in instead of getting a 401.
    if session_id:
        session = session_manager.get_session(session_id)
        if not session or session["username"] != username:
            # Restore the session with the original session_id so existing
            # tokens keep working without the client needing a new token.
            sessions = session_manager.load_sessions()
            sessions[session_id] = {
                "session_id": session_id,
                "username": username,
                "device": "Restored",
                "browser": "Restored",
                "os": "Restored",
                "location": "Unknown",
                "ip_address": "Unknown",
                "last_active": __import__("time").time(),
                "created_at": __import__("time").time(),
            }
            session_manager.save_sessions(sessions)
    else:
        # Old token without session_id — create a new session
        session_id = session_manager.create_session(username)

    session_manager.update_session_activity(session_id)

    return {"username": username, "data": users[username], "session_id": session_id}


bearer_scheme_optional = HTTPBearer(auto_error=False)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme_optional),
) -> dict:
    if not credentials:
        return {"username": "guest", "data": {}}
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        return {"username": "guest", "data": {}}
    username = payload.get("sub", "guest")
    users = user_auth.load_users()
    udata = users.get(username, {}) if username != "guest" else {}
    return {"username": username, "data": udata}
