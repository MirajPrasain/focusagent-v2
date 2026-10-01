from datetime import datetime
from typing import Optional

from beanie import Document


class User(Document):
    email: str
    # None for an account made through Google sign-in, which has no password
    password_hash: Optional[str] = None
    google_id: Optional[str] = None
    created_at: datetime

    class Settings:
        name = "users"


class Session(Document):
    user_id: str
    duration_seconds: int
    focused_seconds: int
    total_seconds: int
    longest_stretch_seconds: int
    timeline: list[dict]
    created_at: datetime

    class Settings:
        name = "sessions"
