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
        
    if not session_id:
        raise HTTPException(status_code=401, detail="Invalid token (no session)")
        
    session = session_manager.get_session(session_id)
    if not session or session["username"] != username:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    users = user_auth.load_users()
    if username not in users:
        raise HTTPException(status_code=401, detail="User not found")
        
    session_manager.update_session_activity(session_id)

    return {"username": username, "data": users[username], "session_id": session_id}
