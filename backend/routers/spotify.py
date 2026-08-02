from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import os
import time
import httpx
from core.deps import get_current_user

router = APIRouter(prefix="/api/spotify", tags=["spotify"])

# Simple in-memory token cache
SPOTIFY_TOKEN = None
TOKEN_EXPIRES_AT = 0

async def get_spotify_token() -> str:
    global SPOTIFY_TOKEN, TOKEN_EXPIRES_AT
    
    # Check if token is still valid (with a 60-second buffer)
    if SPOTIFY_TOKEN and time.time() < TOKEN_EXPIRES_AT - 60:
        return SPOTIFY_TOKEN
        
    client_id = os.environ.get("SPOTIFY_CLIENT_ID")
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET")
    
    if not client_id or not client_secret or client_secret == "paste_your_secret_here":
        raise HTTPException(
            status_code=500, 
            detail="Spotify Client ID or Secret is not configured. Please add them to the backend .env file."
        )

    # Use Client Credentials flow
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            auth=(client_id, client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to authenticate with Spotify API")
            
        data = response.json()
        SPOTIFY_TOKEN = data.get("access_token")
        expires_in = data.get("expires_in", 3600)
        TOKEN_EXPIRES_AT = time.time() + expires_in
        
    return SPOTIFY_TOKEN

@router.get("/search")
async def search_spotify(q: str, type: str = "track", limit: int = 20, current_user: dict = Depends(get_current_user)):
    """Search for tracks or artists on Spotify"""
    if not q:
        return {"tracks": {"items": []}}
        
    token = await get_spotify_token()
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.spotify.com/v1/search",
            params={"q": q, "type": type, "limit": limit},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from Spotify API")
            
        return response.json()

@router.get("/trending")
async def get_trending(current_user: dict = Depends(get_current_user)):
    """Fetch new releases/trending tracks for the picker"""
    token = await get_spotify_token()
    
    async with httpx.AsyncClient() as client:
        # We fetch the "New Releases" as trending
        response = await client.get(
            "https://api.spotify.com/v1/browse/new-releases",
            params={"limit": 20},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from Spotify API")
            
        return response.json()

@router.get("/recommendations")
async def get_recommendations(seed_genres: str = "movies", current_user: dict = Depends(get_current_user)):
    """Get recommendations based on genre (e.g. movies, anime)"""
    token = await get_spotify_token()
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.spotify.com/v1/recommendations",
            params={"seed_genres": seed_genres, "limit": 20},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Failed to fetch from Spotify API")
            
        return response.json()
