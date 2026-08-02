"""
Auth router — login, signup (with OTP), forgot password, token validation.
"""

import time
import urllib.parse

import httpx
from core.auth import create_access_token
from core.config import get_settings
from core.deps import get_current_user
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from processing import auth as user_auth
from processing import email_service, session_manager

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

# In-memory OTP store: { email: {otp, expires_at, data} }
_otp_store: dict = {}


# ── Models ────────────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str
    password: str


class SignupRequest(BaseModel):
    username: str
    name: str
    password: str


class OAuthRequest(BaseModel):
    username: str
    name: str
    email: str
    photo_url: str
    provider_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/login")
def login(body: LoginRequest, request: Request):
    success, result = user_auth.login(body.username, body.password)
    if not success:
        raise HTTPException(status_code=401, detail=result)

    user_agent = request.headers.get("user-agent", "Unknown")
    ip_address = request.headers.get(
        "x-forwarded-for", request.client.host if request.client else "Unknown"
    )

    # Very basic user agent parsing
    browser = "Unknown"
    os_name = "Unknown"
    if "Firefox" in user_agent:
        browser = "Firefox"
    elif "Chrome" in user_agent:
        browser = "Chrome"
    elif "Safari" in user_agent:
        browser = "Safari"
    elif "Edge" in user_agent:
        browser = "Edge"

    if "Windows" in user_agent:
        os_name = "Windows"
    elif "Mac" in user_agent:
        os_name = "macOS"
    elif "Linux" in user_agent:
        os_name = "Linux"
    elif "Android" in user_agent:
        os_name = "Android"
    elif "iPhone" in user_agent or "iPad" in user_agent:
        os_name = "iOS"

    session_id = session_manager.create_session(
        body.username,
        device="Browser",  # simplified
        browser=browser,
        os_name=os_name,
        location="Unknown (Mock)",  # Mock location
        ip_address=ip_address,
    )

    token = create_access_token({"sub": body.username, "session_id": session_id})
    return {
        "token": token,
        "user": {
            "username": body.username,
            "name": result.get("name"),
            "email": result.get("email"),
            "profile": result.get("profile", {}),
            "wishlist": result.get("wishlist", []),
            "watched_list": result.get("watched_list", []),
            "onboarding_completed": result.get("onboarding_completed", True), # Existing users default to true
            "preferences": result.get("preferences", {}),
        },
    }


@router.post("/signup")
def signup(body: SignupRequest, request: Request):
    """Direct signup with no email verification"""
    # Validate username
    valid, msg = user_auth.validate_username(body.username)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    # Validate password
    valid, msg = user_auth.validate_password_strength(body.password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    success, msg = user_auth.signup(body.username, body.name, body.password)
    if not success:
        raise HTTPException(status_code=400, detail=msg)

    # Automatically log them in after signup
    return login(LoginRequest(username=body.username, password=body.password), request)


# ── Google OAuth ──
@router.get("/google/login")
def google_login(redirect_to: str = "https://novaflix.bice.vercel.app/login"):
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": redirect_to,
        "access_type": "offline",
        "prompt": "consent",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(
        params
    )
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str = None,
    error: str = None,
    state: str = "https://novaflix.bice.vercel.app/login",
):
    if error:
        return RedirectResponse(url=f"{state}?error={urllib.parse.quote(error)}")
    if not code:
        return RedirectResponse(url=f"{state}?error=missing_code")

    # Exchange authorization code for access token
    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
                timeout=10.0,
            )
            token_response.raise_for_status()
            tokens = token_response.json()
            access_token = tokens.get("access_token")

            # Fetch user info
            user_response = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10.0,
            )
            user_response.raise_for_status()
            user_info = user_response.json()
        except httpx.HTTPStatusError as e:
            detail = f"{e.response.status_code} - {e.response.text}"
            return RedirectResponse(
                url=f"{state}?error=google_auth_failed&detail={urllib.parse.quote(detail)}"
            )
        except Exception as e:
            return RedirectResponse(
                url=f"{state}?error=google_auth_failed&detail={urllib.parse.quote(str(e))}"
            )

    email = user_info.get("email")
    name = user_info.get("name", "Google User")
    sub = user_info.get("sub")
    picture = user_info.get("picture", "")

    if not email:
        return RedirectResponse(url=f"{state}?error=email_required")

    base_username = email.split("@")[0].lower()
    success, result = user_auth.oauth_login(
        username=base_username,
        name=name,
        email=email,
        photo_url=picture,
        provider_id=f"google-{sub}",
    )

    if not success:
        return RedirectResponse(url=f"{state}?error=login_failed")

    user_agent = request.headers.get("user-agent", "Unknown")
    ip_address = request.headers.get(
        "x-forwarded-for", request.client.host if request.client else "Unknown"
    )

    session_id = session_manager.create_session(
        base_username,
        device="Browser",
        browser="Unknown" if not user_agent else user_agent[:20],
        os_name="Unknown",
        location="Unknown (OAuth)",
        ip_address=ip_address,
    )

    token = create_access_token({"sub": base_username, "session_id": session_id})
    return RedirectResponse(url=f"{state}?token={token}")


# ── Facebook OAuth ──
@router.get("/facebook/login")
def facebook_login(redirect_to: str = "https://novaflix.bice.vercel.app/login"):
    params = {
        "client_id": settings.FACEBOOK_APP_ID,
        "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
        "state": redirect_to,
        "scope": "public_profile",
    }
    url = "https://www.facebook.com/v19.0/dialog/oauth?" + urllib.parse.urlencode(
        params
    )
    return RedirectResponse(url=url)


@router.get("/facebook/callback")
async def facebook_callback(
    request: Request,
    code: str = None,
    error: str = None,
    state: str = "https://novaflix.bice.vercel.app/login",
):
    if error:
        return RedirectResponse(url=f"{state}?error={urllib.parse.quote(error)}")
    if not code:
        return RedirectResponse(url=f"{state}?error=missing_code")

    async with httpx.AsyncClient() as client:
        try:
            token_response = await client.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "client_id": settings.FACEBOOK_APP_ID,
                    "client_secret": settings.FACEBOOK_APP_SECRET,
                    "redirect_uri": settings.FACEBOOK_REDIRECT_URI,
                    "code": code,
                },
                timeout=10.0,
            )
            token_response.raise_for_status()
            tokens = token_response.json()
            access_token = tokens.get("access_token")

            # Fetch user info
            user_response = await client.get(
                "https://graph.facebook.com/me",
                params={
                    "fields": "id,name,email,picture.type(large)",
                    "access_token": access_token,
                },
                timeout=10.0,
            )
            user_response.raise_for_status()
            user_info = user_response.json()
        except httpx.HTTPStatusError as e:
            detail = f"{e.response.status_code} - {e.response.text}"
            return RedirectResponse(
                url=f"{state}?error=facebook_auth_failed&detail={urllib.parse.quote(detail)}"
            )
        except Exception as e:
            return RedirectResponse(
                url=f"{state}?error=facebook_auth_failed&detail={urllib.parse.quote(str(e))}"
            )

    fb_id = user_info.get("id")
    name = user_info.get("name", "Facebook User")
    email = user_info.get("email") or f"{fb_id}@facebook.com"

    picture_data = user_info.get("picture", {}).get("data", {})
    picture = picture_data.get("url", "")

    base_username = email.split("@")[0].lower()
    success, result = user_auth.oauth_login(
        username=base_username,
        name=name,
        email=email,
        photo_url=picture,
        provider_id=f"facebook-{fb_id}",
    )

    if not success:
        return RedirectResponse(url=f"{state}?error=login_failed")

    user_agent = request.headers.get("user-agent", "Unknown")
    ip_address = request.headers.get(
        "x-forwarded-for", request.client.host if request.client else "Unknown"
    )

    session_id = session_manager.create_session(
        base_username,
        device="Browser",
        browser="Unknown" if not user_agent else user_agent[:20],
        os_name="Unknown",
        location="Unknown (OAuth)",
        ip_address=ip_address,
    )

    token = create_access_token({"sub": base_username, "session_id": session_id})
    return RedirectResponse(url=f"{state}?token={token}")


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    udata = current_user["data"]
    return {
        "username": current_user["username"],
        "name": udata.get("name"),
        "email": udata.get("email"),
        "profile": udata.get("profile", {}),
        "wishlist": udata.get("wishlist", []),
        "watched_list": udata.get("watched_list", []),
        "onboarding_completed": udata.get("onboarding_completed", True),
        "preferences": udata.get("preferences", {}),
    }


@router.post("/logout")
def logout(current_user: dict = Depends(get_current_user)):
    session_id = current_user["session_id"]
    session_manager.revoke_session(session_id)
    return {"detail": "Logged out successfully"}


@router.post("/refresh-session")
def refresh_session(current_user: dict = Depends(get_current_user)):
    """Extend the current session activity timestamp to keep user logged in."""
    session_id = current_user["session_id"]
    session_manager.update_session_activity(session_id)
    return {
        "detail": "Session refreshed",
        "username": current_user["username"],
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


def _mask_email(email: str) -> str:
    parts = email.split("@")
    u = parts[0]
    n = len(u)
    if n <= 1:
        masked = "*"
    elif n == 2:
        masked = u[0] + "*"
    else:
        masked = u[0] + "*" * (n - 2) + u[-1]
    return f"{masked}@{parts[1]}"
