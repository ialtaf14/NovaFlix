from fastapi import APIRouter, Query
from processing import preprocess

router = APIRouter(prefix="/api/anime", tags=["Anime"])

@router.get("/list")
def list_anime():
    """Returns a list of all anime titles for search autocomplete."""
    titles = preprocess.get_all_anime_titles()
    return {"titles": titles}

@router.get("/search")
def search_anime(q: str = Query(None), year: str = Query(None), genre: str = Query(None)):
    """Search for anime by title or filters."""
    try:
        if q and len(q) >= 2:
            # Try to do a proper text search
            anime_list = preprocess.get_all_anime_titles()
            q_lower = q.lower()
            results = [a for a in anime_list if q_lower in a.lower()][:40]
            # Get details for each result
            detailed_results = []
            for title in results:
                details = preprocess.get_anime_details(title)
                if details:
                    detailed_results.append({
                        "title": title,
                        "poster": details.get("poster", ""),
                        "rating": details.get("rating", "N/A"),
                        "year": details.get("year", "N/A")
                    })
            return {"results": detailed_results}
        else:
            # Fallback to browse
            res = preprocess.browse_anime(page=1, letter=q[0].upper() if q else "All", genre=genre if genre else "All")
            return {"results": res.get("anime", [])}
    except Exception as e:
        return {"results": [], "error": str(e)}

@router.get("/browse")
def browse_anime(page: int = 1, letter: str = "All", genre: str = "All"):
    """Browse anime with pagination and filters."""
    return preprocess.browse_anime(page=page, letter=letter, genre=genre)

@router.get("/details")
def anime_details(title: str):
    """Get full details for a specific anime."""
    details = preprocess.get_anime_details(title)
    if not details:
        return {"error": "Anime not found"}
    return details

@router.get("/trending")
def trending_anime():
    """Get trending anime."""
    results = preprocess.get_trending_anime()
    return {"trending": results}

@router.get("/latest")
def latest_anime():
    """Get latest added anime."""
    results = preprocess.get_latest_anime()
    return {"latest": results}

@router.get("/episodes")
def get_anime_episodes(title: str = Query(...), season: int = Query(1, ge=1)):
    """Get episodes for a specific season of anime."""
    try:
        episodes = preprocess.get_anime_episodes(title, season)
        return {"episodes": episodes, "season": season, "title": title}
    except Exception as e:
        return {"episodes": [], "season": season, "title": title, "error": str(e)}
