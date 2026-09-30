from datetime import datetime, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from auth import create_access_token, decode_access_token, hash_password, verify_password
from models import User

router = APIRouter()


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/signup")
async def signup(body: SignupRequest):
    existing = await User.find_one(User.email == body.email)
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        created_at=datetime.now(timezone.utc),
    )
    await user.insert()
    return {"token": create_access_token(str(user.id))}


@router.post("/login")
async def login(body: LoginRequest):
    invalid_credentials = HTTPException(status_code=401, detail="Invalid email or password")

    user = await User.find_one(User.email == body.email)
    if user is None or not verify_password(body.password, user.password_hash):
        raise invalid_credentials

    return {"token": create_access_token(str(user.id))}


async def get_current_user(authorization: str = Header(None)) -> User:
    unauthorized = HTTPException(status_code=401, detail="Not authenticated")

    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized

    token = authorization.removeprefix("Bearer ")
    user_id = decode_access_token(token)
    if user_id is None:
        raise unauthorized

    try:
        user = await User.get(PydanticObjectId(user_id))
    except Exception:
        raise unauthorized

    if user is None:
        raise unauthorized

    return user


# TEMPORARY: proves get_current_user works end to end. Delete this route
# once real protected routes land.
@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email}
