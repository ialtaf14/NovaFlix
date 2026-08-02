"""
Application configuration — reads from .env file.
"""
from typing import List, Union
from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
import os
import json


class Settings(BaseSettings):
    # JWT — MUST be set via .env / environment variable in production
    SECRET_KEY: str = "novaflix-production-secret-key-fallback-2026-safe-default-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_DAYS: int = 365

    # Email (SMTP) — set via .env file using a Gmail App Password
    EMAIL_SENDER: str = ""
    EMAIL_PASSWORD: str = ""

    # Data paths (relative to the Novaflix directory)
    DATA_DIR: str = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..")
    )
    FILES_DIR: str = os.path.join(DATA_DIR, "Files")
    USERS_FILE: str = os.path.join(DATA_DIR, "users.json")

    # Spotify API
    SPOTIFY_CLIENT_ID: str = ""
    SPOTIFY_CLIENT_SECRET: str = ""

    # Google OAuth
    GOOGLE_CLIENT_ID: str = "847548009302-62qnn3qsan87rtlvum62e3ibs73e3l33.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "https://novaflix-backend.onrender.com/api/auth/google/callback"

    # Facebook OAuth
    FACEBOOK_APP_ID: str = "26310019485341381"
    FACEBOOK_APP_SECRET: str = "e0f62cdb6d357d58511be0f10580afe8"
    FACEBOOK_REDIRECT_URI: str = "https://novaflix-backend.onrender.com/api/auth/facebook/callback"


    # CORS — add your production domain via FRONTEND_ORIGIN in .env
    # (when the frontend is served by this backend itself, same-origin
    #  requests don't need CORS at all)
    FRONTEND_ORIGIN: str = ""
    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "https://novaflix.bice.vercel.app",
        "https://novaflix-backend.onrender.com",
    ]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                try:
                    return json.loads(v)
                except Exception:
                    pass
            if "," in v:
                return [x.strip() for x in v.split(",") if x.strip()]
            return [v]
        return v

    def model_post_init(self, __context) -> None:
        if not self.SECRET_KEY:
            self.SECRET_KEY = "novaflix-production-secret-key-fallback-2026-safe-default-key"
        if self.FRONTEND_ORIGIN and self.FRONTEND_ORIGIN not in self.ALLOWED_ORIGINS:
            self.ALLOWED_ORIGINS.append(self.FRONTEND_ORIGIN)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
