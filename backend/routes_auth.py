import os
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import google.auth.transport.requests
import requests
from beanie import PydanticObjectId
from fastapi import APIRouter, Cookie, Header, HTTPException
from fastapi.responses import RedirectResponse
from google.oauth2 import id_token
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from auth import create_access_token, decode_access_token, hash_password, verify_password
from models import User

router = APIRouter()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
# The random state sent to Google, kept in this cookie between /auth/google and its callback (the CSRF check)
OAUTH_STATE_COOKIE = "oauth_state"
OAUTH_STATE_MAX_AGE = 600  # seconds


def normalize_email(email: str) -> str:
    """Emails are stored and looked up lowercased, so a difference in case never makes a second account."""
    return email.lower()


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(body: SignupRequest):
    email = normalize_email(body.email)
    existing = await User.find_one(User.email == email)
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        created_at=datetime.now(timezone.utc),
    )
    await user.insert()
    return {"token": create_access_token(str(user.id))}


@router.post("/login")
async def login(body: LoginRequest):
    invalid_credentials = HTTPException(status_code=401, detail="Invalid email or password")

    user = await User.find_one(User.email == normalize_email(body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise invalid_credentials

    return {"token": create_access_token(str(user.id))}


async def user_for_token(token: Optional[str]) -> Optional[User]:
    """The user a token from /signup or /login belongs to, or None if it's missing, invalid or expired, or its user
    is gone. Shared by get_current_user and the /ws/study websocket (ws_routes/study_ws.py)."""
    if not token:
        return None

    user_id = decode_access_token(token)
    if user_id is None:
        return None

    try:
        return await User.get(PydanticObjectId(user_id))
    except Exception:
        return None


async def get_current_user(authorization: str = Header(None)) -> User:
    unauthorized = HTTPException(status_code=401, detail="Not authenticated")

    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized

    user = await user_for_token(authorization.removeprefix("Bearer "))
    if user is None:
        raise unauthorized

    return user


async def find_or_create_user(email: str, google_id: str) -> Optional[User]:
    """The user for a verified Google sign-in, found by email: created without a password if there's none, and
    linked to this Google account if it isn't linked yet. None if it's linked to a different Google account."""
    email = normalize_email(email)
    user = await User.find_one(User.email == email)
    if user is None:
        user = User(email=email, password_hash=None, google_id=google_id, created_at=datetime.now(timezone.utc))
        await user.insert()
    elif user.google_id is None:
        # Known limitation, out of scope for this stage: /signup doesn't verify email, so a password account
        # pre-registered with someone else's email gets linked here and its password keeps working
        user.google_id = google_id
        await user.save()
    elif user.google_id != google_id:
        return None
    return user


def frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:5173").rstrip("/")


@router.get("/auth/google")
async def google_login():
    """Sends the browser to Google's sign-in, which comes back to /auth/google/callback."""
    redirect_uri = os.environ["GOOGLE_REDIRECT_URI"]
    state = secrets.token_urlsafe(16)
    params = {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
    }
    response = RedirectResponse(f"{GOOGLE_AUTH_URL}?{urlencode(params)}")
    # lax, not strict: the cookie has to come along on Google's cross-site redirect back to the callback
    response.set_cookie(OAUTH_STATE_COOKIE, state, max_age=OAUTH_STATE_MAX_AGE, httponly=True, samesite="lax",
                        secure=redirect_uri.startswith("https://"))
    return response


@router.get("/auth/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None,
                          oauth_state: Optional[str] = Cookie(None)):
    """Google's redirect back after sign-in. Checks the state, trades the code for Google's id token, verifies it
    and redirects to the frontend with the same JWT /login returns, in the URL fragment (kept out of server logs).
    Google sends error instead of code when sign-in didn't happen (the user cancelled): back to the login page."""
    if error:
        response = RedirectResponse(f"{frontend_url()}/login")
        response.delete_cookie(OAUTH_STATE_COOKIE)
        return response
    if not state or not oauth_state or not secrets.compare_digest(state, oauth_state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    google_failed = HTTPException(status_code=401, detail="Google sign-in failed")
    client_id = os.environ["GOOGLE_CLIENT_ID"]

    # requests and the token check (which fetches Google's certificates) block, so they run off the event loop
    token_response = await run_in_threadpool(requests.post, GOOGLE_TOKEN_URL, data={
        "code": code,
        "client_id": client_id,
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": os.environ["GOOGLE_REDIRECT_URI"],
        "grant_type": "authorization_code",
    }, timeout=10)
    raw_id_token = token_response.json().get("id_token") if token_response.ok else None
    if not raw_id_token:
        raise google_failed

    try:
        claims = await run_in_threadpool(
            id_token.verify_oauth2_token, raw_id_token, google.auth.transport.requests.Request(), client_id)
    except Exception:
        raise google_failed
    if claims.get("email_verified") is not True:
        raise google_failed

    user = await find_or_create_user(claims["email"], claims["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="This account is linked to a different Google account")

    response = RedirectResponse(f"{frontend_url()}/oauth-callback#token={create_access_token(str(user.id))}")
    response.delete_cookie(OAUTH_STATE_COOKIE)
    return response
