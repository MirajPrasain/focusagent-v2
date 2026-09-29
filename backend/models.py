from datetime import datetime

from beanie import Document


class User(Document):
    email: str
    password_hash: str
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
