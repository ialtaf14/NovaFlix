from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from processing import preprocess
from core.deps import get_current_user

router = APIRouter(prefix="/api/series", tags=["series"])

@router.get("/list")
def get_all_series():
    """All series titles for dropdown/autocomplete."""
    return {"titles": preprocess.get_all_series_titles()}

@router.get("/search")
def search_series(
    q: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
    imdb_min: Optional[float] = Query(None),
    genre: Optional[str] = Query(None),
):
    import pandas as pd
    series_df = preprocess.load_series_df()
    
    if series_df.empty:
        return {"query": q or "", "results": []}
        
    merged = series_df.copy()
    
    # Text search
    if q and len(q) >= 2:
        q_lower = q.lower()
        merged = merged[merged["title"].str.lower().str.contains(q_lower, na=False)]
        
    # Year filter
    if year:
        merged = merged[merged["first_air_date"].astype(str).str.startswith(year)]
        
    # IMDB filter
    if imdb_min is not None:
        merged = merged[merged["vote_average"].astype(float) >= imdb_min]
        
    # Genre filter
    if genre:
        def has_genre(genres):
            if isinstance(genres, list):
                return any(genre.lower() in g.lower() for g in genres)
            return genre.lower() in str(genres).lower()
        merged = merged[merged["genres"].apply(has_genre)]
        
    results = []
    seen = set()
    
    for _, row in merged.iterrows():
        title = row["title"]
        if title in seen:
            continue
        seen.add(title)
        
        poster, rating, y = preprocess.fetch_series_poster(title)
        results.append({
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": y
        })
        if len(results) >= 40:
            break
            
    return {"query": q or "", "results": results}

@router.get("/details")
def get_series_details(title: str = Query(...)):
    details = preprocess.get_series_details(title)
    if not details:
        raise HTTPException(status_code=404, detail="Series not found.")
    return details

@router.get("/browse")
def browse_series(
    page: int = Query(1, ge=1),
    letter: str = Query("All"),
    genre: str = Query("All")
):
    return preprocess.browse_series(page=page, letter=letter, genre=genre)

@router.get("/trending")
def get_trending_series():
    return {"category": "trending", "series": preprocess.get_trending_series()}

@router.get("/latest")
def get_latest_series():
    return {"series": preprocess.get_latest_series()}

@router.get("/episodes")
def get_series_episodes(title: str = Query(...), season: int = Query(1, ge=1)):
    """Get episodes for a specific season of a series."""
    try:
        episodes = preprocess.get_series_episodes(title, season)
        return {"episodes": episodes, "season": season, "title": title}
    except Exception as e:
        return {"episodes": [], "season": season, "title": title, "error": str(e)}
