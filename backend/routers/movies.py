"""
Movies router — recommendations, search, details, latest, browse, actor.
"""
from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from processing import preprocess
from core.deps import get_current_user

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("/list")
def get_all_movies():
    """All movie titles for the recommendation dropdown."""
    return {"titles": preprocess.get_all_titles()}


@router.get("/recommend")
def recommend(title: str = Query(..., description="Movie title to base recommendations on")):
    recs = preprocess.get_recommendations(title)
    return {"movie": title, "recommendations": recs}


@router.get("/search")
def search(
    q: Optional[str] = Query(None),
    release_year: Optional[str] = Query(None),
    imdb_min: Optional[float] = Query(None),
    imdb_max: Optional[float] = Query(None),
    novaflix_min: Optional[float] = Query(None),
    novaflix_max: Optional[float] = Query(None),
    runtime_min: Optional[int] = Query(None),
    runtime_max: Optional[int] = Query(None),
    ott_platform: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    genre: Optional[str] = Query(None),
    cast: Optional[str] = Query(None),
    director: Optional[str] = Query(None),
):
    import pandas as pd
    from typing import Optional
    movies_df = preprocess.load_movies_df()
    movies2_df = preprocess.load_movies2_df()
    
    # Join on 'title'
    merged = pd.merge(movies_df, movies2_df, on="title", how="inner")
    
    # Apply text search if q is provided
    if q and len(q) >= 2:
        search_results = preprocess.search_movies(q, limit=100)
        titles = [m["title"] for m in search_results]
        merged = merged[merged["title"].isin(titles)]
        
    # Apply release year filter
    if release_year:
        if "-" in release_year:
            try:
                start_y, end_y = map(int, release_year.split("-"))
                merged["year_int"] = pd.to_numeric(merged["release_date"].astype(str).str[:4], errors="coerce")
                merged = merged[(merged["year_int"] >= start_y) & (merged["year_int"] <= end_y)]
            except:
                pass
        else:
            merged = merged[merged["release_date"].astype(str).str.startswith(release_year)]
            
    # Apply IMDb score (vote_average) range filter
    if imdb_min is not None:
        merged = merged[merged["vote_average"].astype(float) >= imdb_min]
    if imdb_max is not None:
        merged = merged[merged["vote_average"].astype(float) <= imdb_max]
        
    # Apply NovaFlix score range filter (using vote_average as proxy)
    if novaflix_min is not None:
        merged = merged[merged["vote_average"].astype(float) >= novaflix_min]
    if novaflix_max is not None:
        merged = merged[merged["vote_average"].astype(float) <= novaflix_max]
        
    # Apply runtime range filter
    if runtime_min is not None:
        merged = merged[merged["runtime"].astype(float) >= runtime_min]
    if runtime_max is not None:
        merged = merged[merged["runtime"].astype(float) <= runtime_max]
        
    # Apply OTT platform filter
    if ott_platform:
        import hashlib
        def matches_ott(title):
            h = int(hashlib.md5(title.encode("utf-8")).hexdigest(), 16)
            prov = preprocess.PROVIDERS[h % len(preprocess.PROVIDERS)]["name"]
            return ott_platform.lower() in prov.lower()
            
        merged["matches_ott"] = merged["title"].apply(matches_ott)
        merged = merged[merged["matches_ott"]]
        
    # Apply language filter
    if language:
        if "original_language" in merged.columns:
            lang_map = {"en": "english", "es": "spanish", "fr": "french", "ja": "japanese", "hi": "hindi", "de": "german"}
            merged["lang_lower"] = merged["original_language"].astype(str).str.lower().map(lang_map).fillna(merged["original_language"].astype(str).str.lower())
            merged = merged[merged["lang_lower"].str.contains(language.lower())]
            
    # Apply country filter
    if country:
        if "production_countries" in merged.columns:
            merged = merged[merged["production_countries"].astype(str).str.lower().str.contains(country.lower())]
            
    # Apply genre filter
    if genre:
        def has_genre(genres):
            if isinstance(genres, list):
                return any(genre.lower() in g.lower() for g in genres)
            return genre.lower() in str(genres).lower()
        merged = merged[merged["genres"].apply(has_genre)]
        
    # Apply cast filter
    if cast:
        def has_cast(top_cast):
            if isinstance(top_cast, list):
                return any(cast.lower() in c.lower() for c in top_cast)
            return cast.lower() in str(top_cast).lower()
        merged = merged[merged["top_cast"].apply(has_cast)]
        
    # Apply director filter
    if director:
        def has_director(directors):
            if isinstance(directors, list):
                return any(director.lower() in d.lower() for d in directors)
            return director.lower() in str(directors).lower()
        merged = merged[merged["director"].apply(has_director)]
        
    # Format results
    results = []
    seen = set()
    for _, row in merged.iterrows():
        title = row["title"]
        if title in seen:
            continue
        seen.add(title)
        
        poster, rating, year = preprocess.fetch_poster(title)
        item = {
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year
        }
        preprocess._inject_novaflix_rating(title, item)
        results.append(item)
        if len(results) >= 40:
            break
            
    # Include internet results from OMDB if q was provided
    if q and len(q) >= 2 and len(results) < 40:
        for item in search_results:
            title = item["title"]
            if title not in seen:
                seen.add(title)
                results.append(item)
                if len(results) >= 40:
                    break
                    
    return {"query": q or "", "results": results}


@router.get("/details")
def get_details(title: str = Query(...)):
    details = preprocess.get_movie_details(title)
    if not details:
        raise HTTPException(status_code=404, detail="Movie not found.")
    return details


@router.get("/latest")
def get_latest():
    return {"movies": preprocess.get_latest_movies()}

@router.get("/trending/{category}")
def get_trending(category: str):
    valid_categories = ["daily", "weekly", "monthly", "region", "top_rated", "recent", "hidden_gems"]
    if category not in valid_categories:
        category = "daily"
    return {"category": category, "movies": preprocess.get_trending_movies(category)}


@router.get("/browse")
def browse(
    page: int = Query(1, ge=1),
    letter: str = Query("All"),
    year: str = Query(""),
):
    return preprocess.browse_movies(page=page, letter=letter, year=year)


@router.get("/actor")
def get_actor(name: str = Query(...)):
    return preprocess.get_person_details(name)

@router.get("/actors/batch")
def get_actors_batch(names: str = Query(...)):
    raw = [n.strip() for n in names.split(",") if n.strip()]
    results = {}
    for n in raw:
        results[n] = preprocess.get_person_details(n)
    return {"actors": results}

@router.get("/trailer")
def get_trailer(title: str = Query(...)):
    query = f"{title} official trailer"
    video_id = preprocess.search_youtube_trailer(query)
    if not video_id:
        query = f"{title} trailer"
        video_id = preprocess.search_youtube_trailer(query)
    if not video_id:
        raise HTTPException(status_code=404, detail="Trailer not found.")
    return {"video_id": video_id, "query": query}


@router.get("/screenshots")
def get_screenshots(title: str = Query(...)):
    screenshots = preprocess.get_screenshots(title)
    return {"screenshots": screenshots}


@router.get("/personalized")
def get_personalized(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    udata = current_user["data"]
    
    # 1. Continue Watching (watch_timestamp > 0 and watched == False)
    interactions = udata.get("interactions", {})
    continue_watching_titles = [
        title for title, data in interactions.items()
        if data.get("watch_timestamp", 0) > 0 and not data.get("watched", False)
    ]
    continue_watching_titles.sort(key=lambda t: interactions[t].get("watch_timestamp", 0), reverse=True)
    
    continue_watching = []
    for title in continue_watching_titles[:10]:
        poster, rating, year = preprocess.fetch_poster(title)
        item = {
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year
        }
        preprocess._inject_novaflix_rating(title, item)
        continue_watching.append(item)
        
    # 2. Wishlist Picks
    wishlist_titles = udata.get("wishlist", [])
    wishlist_picks = []
    for title in wishlist_titles[:10]:
        poster, rating, year = preprocess.fetch_poster(title)
        item = {
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year
        }
        preprocess._inject_novaflix_rating(title, item)
        wishlist_picks.append(item)
        
    # 3. Watch History
    watched_titles = udata.get("watched_list", [])
    watch_history = []
    for title in watched_titles[:10]:
        poster, rating, year = preprocess.fetch_poster(title)
        item = {
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year
        }
        preprocess._inject_novaflix_rating(title, item)
        watch_history.append(item)
        
    # 4. Recommended For You (personalized recs)
    recommended = preprocess.get_personalized_recs(uname, limit=12)
    
    return {
        "continue_watching": continue_watching,
        "wishlist_picks": wishlist_picks,
        "recommended": recommended,
        "watch_history": watch_history
    }

@router.get("/recommended-page")
def get_recommended_page(current_user: dict = Depends(get_current_user)):
    uname = current_user["username"]
    collections = preprocess.generate_collections(uname)
    return {"collections": collections}

@router.get("/director")
def get_director_details(name: str = Query(...)):
    details = preprocess.get_person_details(name)
    movies_df = preprocess.load_movies_df()
    movies2_df = preprocess.load_movies2_df()
    merged = movies_df.merge(movies2_df[["title", "vote_average"]], on="title", how="inner")

    dir_movies = merged[merged["director"].apply(
        lambda d: name in d if isinstance(d, list) else False
    )].copy()

    dir_movies = dir_movies.sort_values("vote_average", ascending=False).head(15)
    movies = []
    for _, row in dir_movies.iterrows():
        poster, rating, year = preprocess.fetch_poster(row["title"])
        movies.append({
            "title": row["title"],
            "poster": poster,
            "rating": rating if rating != "N/A" else str(round(row["vote_average"], 1)),
            "year": year,
            "vote_average": round(row["vote_average"], 1)
        })
    return {"director": details, "movies": movies}

@router.get("/collection")
def get_collection(
    col_type: str = Query(...),
    query: str = Query(...),
    page: int = Query(1, ge=1),
    current_user: dict = Depends(get_current_user)
):
    uname = current_user["username"]
    movies = preprocess.get_collection_page(col_type, query, page, uname)
    return {"movies": movies, "page": page}


@router.get("/smart-recommend")
def smart_recommend(
    title: str = Query(..., description="Movie title to base recommendations on"),
    current_user: dict = Depends(get_current_user),
):
    """
    Smart recommendations: returns movies grouped by cast, director, genre,
    and similar IMDB rating.  Excludes user's watched list and prioritises
    movies on their wishlist.
    """
    import pandas as pd
    from concurrent.futures import ThreadPoolExecutor

    # Resolve to canonical casing before any DB lookup
    title = preprocess._resolve_title(title)

    titles = preprocess.get_all_titles()
    if title not in titles:
        raise HTTPException(status_code=404, detail=f"Movie '{title}' not found in database.")

    udata = current_user["data"]
    watched_set = set(udata.get("watched_list", []))
    wishlist_set = set(udata.get("wishlist", []))

    # ── load data ──
    movies_df = preprocess.load_movies_df()
    movies2_df = preprocess.load_movies2_df()
    merged = pd.merge(movies_df, movies2_df[["title", "vote_average"]], on="title", how="inner")

    src_row = merged[merged["title"] == title]
    if src_row.empty:
        raise HTTPException(status_code=404, detail="Movie metadata not found.")
    src = src_row.iloc[0]

    # source movie attributes
    src_cast = set(src["top_cast"]) if isinstance(src["top_cast"], list) else set()
    src_director = set(src["director"]) if isinstance(src["director"], list) else set()
    src_genres = set(src["genres"]) if isinstance(src["genres"], list) else set()
    try:
        src_rating = float(src["vote_average"])
    except Exception:
        src_rating = None

    # ── helper: build scored list, exclude watched, prioritise wishlist ──
    def _build(rows_iter, score_fn, limit=15):
        scored = []
        for _, row in rows_iter:
            t = row["title"]
            if t == title or t in watched_set:
                continue
            sc = score_fn(row)
            if sc <= 0:
                continue
            scored.append((t, sc, t in wishlist_set))

        # wishlist first, then by score desc
        scored.sort(key=lambda x: (-int(x[2]), -x[1]))
        return scored[:limit]

    # ── By Cast ──
    def cast_score(row):
        c = set(row["top_cast"]) if isinstance(row["top_cast"], list) else set()
        return len(src_cast & c)

    by_cast = _build(merged.iterrows(), cast_score)

    # ── By Director ──
    def director_score(row):
        d = set(row["director"]) if isinstance(row["director"], list) else set()
        return len(src_director & d)

    by_director = _build(merged.iterrows(), director_score)

    # ── By Genre ──
    def genre_score(row):
        g = set(row["genres"]) if isinstance(row["genres"], list) else set()
        return len(src_genres & g)

    by_genre = _build(merged.iterrows(), genre_score)

    # ── By Rating (±1.0) ──
    def rating_score(row):
        if src_rating is None:
            return 0
        try:
            r = float(row["vote_average"])
        except Exception:
            return 0
        diff = abs(r - src_rating)
        return max(0, 1.0 - diff) if diff <= 1.0 else 0

    by_rating = _build(merged.iterrows(), rating_score)

    # ── fetch posters concurrently ──
    all_titles_needed = set()
    for lst in (by_cast, by_director, by_genre, by_rating):
        for t, _, _ in lst:
            all_titles_needed.add(t)

    poster_map = {}
    def _fetch(t):
        poster, rating, year = preprocess.fetch_poster(t)
        return t, poster, rating, year

    with ThreadPoolExecutor(max_workers=min(20, max(len(all_titles_needed), 1))) as exc:
        for t, poster, rating, year in exc.map(_fetch, all_titles_needed):
            poster_map[t] = (poster, rating, year)

    def _format(scored_list):
        out = []
        for t, _sc, in_wl in scored_list:
            p, r, y = poster_map.get(t, (preprocess.FALLBACK_POSTER, "N/A", "N/A"))
            out.append({
                "title": t,
                "poster": p,
                "rating": r,
                "year": y,
                "in_wishlist": in_wl,
            })
        return out

    return {
        "movie": title,
        "categories": {
            "by_cast": _format(by_cast),
            "by_director": _format(by_director),
            "by_genre": _format(by_genre),
            "by_rating": _format(by_rating),
        },
    }
