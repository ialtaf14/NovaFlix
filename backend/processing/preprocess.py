"""
Movie data preprocessing for FastAPI backend.
Uses functools.lru_cache and in-memory dicts for caching (no Streamlit).
"""

import datetime
import hashlib
import json
import os
import pickle
import re
import string
from functools import lru_cache
from typing import Optional

import nltk
import pandas as pd
import requests
from nltk.stem.porter import PorterStemmer
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

try:
    from core.config import get_settings

    _settings = get_settings()
    FILES_DIR = _settings.FILES_DIR
except Exception:
    FILES_DIR = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "Files")
    )

nltk.download("stopwords", quiet=True)
ps = PorterStemmer()

FALLBACK_POSTER = (
    "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg"
)
FALLBACK_PERSON = (
    "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
)

OMDB_KEYS = ["b9a5e69d", "a9118a3a", "8265bd16", "2a567fb9", "f12ba140", "fd1e1f48"]

# ── In-memory caches ──────────────────────────────────────────────────────────
_poster_cache: dict = {}
_details_cache: dict = {}
_latest_cache: Optional[list] = None
_person_cache: dict = {}
# lowercase -> canonical casing lookup (built lazily)
_title_lookup_cache: dict = {}
_series_details_cache: dict = {}
_anime_details_cache: dict = {}

PROVIDERS = [
    {"name": "Netflix", "logo": "https://images.justwatch.com/icon/207360008/s100"},
    {
        "name": "Amazon Prime Video",
        "logo": "https://images.justwatch.com/icon/52449861/s100",
    },
    {"name": "Disney+", "logo": "https://images.justwatch.com/icon/147638351/s100"},
    {
        "name": "Hulu",
        "logo": "https://cdn.iconscout.com/icon/free/png-256/hulu-226065.png",
    },
    {"name": "Max", "logo": "https://images.justwatch.com/icon/301131154/s100"},
    {"name": "Apple TV+", "logo": "https://images.justwatch.com/icon/152862153/s100"},
]

LATEST_MOVIE_IDS = [
    "tt2202245",
    "tt6263850",
    "tt15239678",
    "tt8741734",
    "tt13634480",
    "tt17019896",
    "tt1648788",
    "tt16332678",
    "tt14539740",
    "tt11389872",
    "tt12584954",
    "tt18412256",
    "tt1464335",
    "tt27521782",
    "tt1496674",
    "tt14513804",
    "tt31737750",
    "tt9603212",
    "tt1757678",
    "tt15573332",
]


# ── Data loading ──────────────────────────────────────────────────────────────


def _get_deleted_movies() -> set:
    deleted_path = os.path.join(FILES_DIR, "deleted_movies.json")
    if os.path.exists(deleted_path):
        with open(deleted_path, "r") as f:
            try:
                return set(json.load(f))
            except Exception:
                return set()
    return set()


@lru_cache(maxsize=128)
def load_movies_df():
    path = os.path.join(FILES_DIR, "movies_dict.pkl")
    if not os.path.exists(path):
        return pd.DataFrame()
    with open(path, "rb") as f:
        df = pd.DataFrame.from_dict(pickle.load(f))
    deleted = _get_deleted_movies()
    if deleted:
        df = df[~df["title"].isin(deleted)]
    return df


@lru_cache(maxsize=1)
def load_movies2_df():
    path = os.path.join(FILES_DIR, "movies2_dict.pkl")
    if not os.path.exists(path):
        return pd.DataFrame()
    with open(path, "rb") as f:
        df = pd.DataFrame.from_dict(pickle.load(f))
    deleted = _get_deleted_movies()
    if deleted:
        df = df[~df["title"].isin(deleted)]
    return df


@lru_cache(maxsize=1)
def load_new_df():
    path = os.path.join(FILES_DIR, "new_df_dict.pkl")
    if not os.path.exists(path):
        return pd.DataFrame()
    with open(path, "rb") as f:
        return pd.DataFrame.from_dict(pickle.load(f))


@lru_cache(maxsize=1)
def load_series_df():
    path = os.path.join(FILES_DIR, "series_dict.pkl")
    if not os.path.exists(path):
        return pd.DataFrame()
    with open(path, "rb") as f:
        df = pd.DataFrame.from_dict(pickle.load(f))
    return df


@lru_cache(maxsize=1)
def load_anime_df():
    path = os.path.join(FILES_DIR, "anime_dict.pkl")
    if not os.path.exists(path):
        return pd.DataFrame()
    with open(path, "rb") as f:
        df = pd.DataFrame.from_dict(pickle.load(f))
    return df


@lru_cache(maxsize=None)
def load_similarity_matrix(pickle_file: str):
    path = os.path.join(FILES_DIR, pickle_file)
    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                return pickle.load(f)
        except Exception:
            pass

    # Dynamic fallback: compute similarity matrix on-demand if .pkl is absent
    col_map = {
        "similarity_tags_tags.pkl": "tags",
        "similarity_tags_genres.pkl": "genres",
        "similarity_tags_tcast.pkl": "tcast",
        "similarity_tags_tcrew.pkl": "tcrew",
        "similarity_tags_tprduction_comp.pkl": "tprduction_comp",
        "similarity_tags_keywords.pkl": "keywords",
    }
    col_name = col_map.get(pickle_file, "tags")
    df = load_new_df()
    if col_name not in df.columns:
        col_name = "tags"
    if col_name in df.columns:
        try:
            cv = CountVectorizer(max_features=5000, stop_words="english")
            vectors = cv.fit_transform(df[col_name].fillna("").astype(str)).toarray()
            return cosine_similarity(vectors)
        except Exception:
            return None
    return None



def get_all_titles() -> list:
    titles = load_new_df()["title"].tolist()
    deleted = _get_deleted_movies()
    valid = [t for t in titles if t not in deleted]
    # Rebuild the case-insensitive lookup whenever we load titles
    global _title_lookup_cache
    _title_lookup_cache = {t.lower(): t for t in valid}
    return valid


def _resolve_title(title: str) -> str:
    """Return the canonical (original-case) title for *title*.

    Falls back to the input unchanged so callers never get None.
    Lookup is case-insensitive and strips leading/trailing whitespace.
    """
    global _title_lookup_cache
    # Warm up the cache on first use
    if not _title_lookup_cache:
        get_all_titles()
    key = title.strip().lower()
    return _title_lookup_cache.get(key, title)


def get_all_series_titles() -> list:
    df = load_series_df()
    if df.empty:
        return []
    return df["title"].tolist()


def get_all_anime_titles() -> list:
    df = load_anime_df()
    if df.empty:
        return []
    return df["title"].tolist()


# ── Poster helpers ────────────────────────────────────────────────────────────


def _tmdb_fetch(title: str, media_type: str = "movie") -> tuple:
    """Fetch poster, rating, and year from TMDB public API (no key required) with title verification."""
    try:
        search_url = (
            f"https://api.tmdb.org/3/search/{media_type}"
            f"?api_key=15d2ea6d0dc1d476efbca3eba2b9bbfb&query={requests.utils.quote(title)}&language=en-US&page=1"
        )
        data = requests.get(search_url, timeout=6).json()
        results = data.get("results", [])
        if results:
            # Look for the best matching item
            target_clean = clean_for_compare(title)
            best_item = None
            for item in results:
                item_title = item.get("title") or item.get("name") or item.get("original_title") or item.get("original_name") or ""
                if clean_for_compare(item_title) == target_clean:
                    best_item = item
                    break
            if not best_item:
                for item in results:
                    item_title = item.get("title") or item.get("name") or item.get("original_title") or item.get("original_name") or ""
                    if item_title.lower().strip() == title.lower().strip():
                        best_item = item
                        break
            if not best_item:
                best_item = results[0]

            item = best_item
            poster_path = item.get("poster_path")
            poster = (
                f"https://image.tmdb.org/t/p/w500{poster_path}"
                if poster_path
                else FALLBACK_POSTER
            )
            rating = (
                str(round(item.get("vote_average", 0), 1))
                if item.get("vote_average")
                else "N/A"
            )
            date_field = item.get("release_date") or item.get("first_air_date") or ""
            year = date_field[:4] if date_field else "N/A"
            return poster, rating, year
    except Exception:
        pass
    return FALLBACK_POSTER, "N/A", "N/A"


def _tmdb_tv_fetch(title: str) -> dict:
    """Fetch complete TV series / anime details from TMDB public API."""
    try:
        api_key = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
        search_url = (
            f"https://api.tmdb.org/3/search/tv"
            f"?api_key={api_key}&query={requests.utils.quote(title)}&language=en-US&page=1"
        )
        data = requests.get(search_url, timeout=6).json()
        results = data.get("results", [])
        if not results:
            return {}
            
        # Match title
        target_clean = clean_for_compare(title)
        best_item = None
        for item in results:
            item_name = item.get("name") or item.get("original_name") or ""
            if clean_for_compare(item_name) == target_clean:
                best_item = item
                break
        if not best_item:
            for item in results:
                item_name = item.get("name") or item.get("original_name") or ""
                if item_name.lower().strip() == title.lower().strip():
                    best_item = item
                    break
        if not best_item:
            best_item = results[0]
            
        tv_id = best_item["id"]
        details_url = f"https://api.tmdb.org/3/tv/{tv_id}?api_key={api_key}&language=en-US"
        details = requests.get(details_url, timeout=6).json()
        return details
    except Exception:
        return {}


def _bing_poster(movie_name: str) -> str:
    try:
        import urllib.parse
        import urllib.request

        query = f"{movie_name} official film poster"
        url = (
            f"https://www.bing.com/images/search"
            f"?q={urllib.parse.quote_plus(query)}&qft=+filterui:aspect-tall&first=1"
        )
        headers = {"User-Agent": "Mozilla/5.0"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=8) as r:
            html = r.read().decode("utf-8")
        for pattern in [
            r"murl&quot;:&quot;(.*?)&quot;",
            r"imgurl&quot;:&quot;(.*?)&quot;",
        ]:
            for img in re.findall(pattern, html):
                if img.startswith("http") and (
                    ".jpg" in img.lower() or ".png" in img.lower()
                ):
                    return img
    except Exception:
        pass
    return FALLBACK_POSTER


def fetch_poster(movie_name: str) -> tuple:
    """Returns (poster_url, rating, year). Tries TMDB first, then OMDB, then Bing."""
    if movie_name in _poster_cache:
        return _poster_cache[movie_name]

    # 1. Try TMDB first (free, no key needed with public key)
    tmdb_poster, tmdb_rating, tmdb_year = _tmdb_fetch(movie_name, "movie")
    if tmdb_poster != FALLBACK_POSTER:
        result = (tmdb_poster, tmdb_rating, tmdb_year)
        _poster_cache[movie_name] = result
        return result

    # 2. Try OMDB (multiple keys)
    try:
        for key in OMDB_KEYS:
            url = f"http://www.omdbapi.com/?t={requests.utils.quote(movie_name)}&apikey={key}"
            data = requests.get(url, timeout=4).json()
            if data.get("Response") == "True":
                poster = data.get("Poster") or FALLBACK_POSTER
                if poster == "N/A":
                    poster = FALLBACK_POSTER
                rating = data.get("imdbRating", "N/A")
                year = data.get("Year", "N/A")
                result = (poster, rating, year)
                _poster_cache[movie_name] = result
                return result
            else:
                err = data.get("Error", "")
                if "Movie not found!" in err:
                    break
                if "Request limit" in err or "Invalid API key" in err:
                    continue
    except Exception:
        pass

    # 3. Fall back to Bing Image Search
    bing_poster_url = _bing_poster(movie_name)
    if bing_poster_url != FALLBACK_POSTER:
        result = (bing_poster_url, "N/A", "N/A")
        _poster_cache[movie_name] = result
        return result

    # 4. Final fallback
    result = (FALLBACK_POSTER, "N/A", "N/A")
    _poster_cache[movie_name] = result
    return result


def fetch_series_poster(series_name: str) -> tuple:
    """Returns (poster_url, rating, year). Tries TMDB then OMDB."""
    cache_key = f"series_{series_name}"
    if cache_key in _poster_cache:
        return _poster_cache[cache_key]

    # TMDB first
    tmdb_poster, tmdb_rating, tmdb_year = _tmdb_fetch(series_name, "tv")
    if tmdb_poster != FALLBACK_POSTER:
        result = (tmdb_poster, tmdb_rating, tmdb_year)
        _poster_cache[cache_key] = result
        return result

    try:
        for key in OMDB_KEYS:
            url = f"http://www.omdbapi.com/?t={requests.utils.quote(series_name)}&type=series&apikey={key}"
            data = requests.get(url, timeout=4).json()
            if data.get("Response") == "True":
                poster = data.get("Poster") or FALLBACK_POSTER
                if poster == "N/A":
                    poster = FALLBACK_POSTER
                rating = data.get("imdbRating", "N/A")
                years = data.get("Year", "N/A")
                year = years.split("-")[0] if "-" in years else years
                result = (poster, rating, year)
                _poster_cache[cache_key] = result
                return result
            else:
                err = data.get("Error", "")
                if "Request limit" in err or "Invalid API key" in err:
                    continue
    except Exception:
        pass

    bing_poster_url = _bing_poster(series_name)
    if bing_poster_url != FALLBACK_POSTER:
        result = (bing_poster_url, "N/A", "N/A")
        _poster_cache[cache_key] = result
        return result

    result = (FALLBACK_POSTER, "N/A", "N/A")
    _poster_cache[cache_key] = result
    return result


def fetch_anime_poster(anime_name: str) -> tuple:
    """Returns (poster_url, rating, year). Tries TMDB then OMDB."""
    cache_key = f"anime_{anime_name}"
    if cache_key in _poster_cache:
        return _poster_cache[cache_key]

    # TMDB TV fallback for anime
    tmdb_poster, tmdb_rating, tmdb_year = _tmdb_fetch(anime_name, "tv")
    if tmdb_poster != FALLBACK_POSTER:
        result = (tmdb_poster, tmdb_rating, tmdb_year)
        _poster_cache[cache_key] = result
        return result

    bing_poster_url = _bing_poster(anime_name)
    if bing_poster_url != FALLBACK_POSTER:
        result = (bing_poster_url, "N/A", "N/A")
        _poster_cache[cache_key] = result
        return result

    result = (FALLBACK_POSTER, "N/A", "N/A")
    _poster_cache[cache_key] = result
    return result


# ── Recommendations ───────────────────────────────────────────────────────────


def get_fallback_recommendations(
    movie: str, n: int = 10, category: str = "daily"
) -> list:
    try:
        movies_df = load_movies_df()
        m_row = movies_df[movies_df["title"] == movie]
        if m_row.empty:
            # Live Fallback for internet movies using TMDB API
            try:
                import requests
                api_key = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
                search_url = f"https://api.tmdb.org/3/search/movie?api_key={api_key}&query={requests.utils.quote(movie)}&language=en-US&page=1"
                data = requests.get(search_url, timeout=5).json()
                results = data.get("results", [])
                
                if results:
                    target_clean = clean_for_compare(movie)
                    best_item = None
                    for item in results:
                        item_title = item.get("title") or item.get("original_title") or ""
                        if clean_for_compare(item_title) == target_clean:
                            best_item = item
                            break
                    if not best_item:
                        best_item = results[0]
                    movie_id = best_item["id"]
                    recs_url = f"https://api.tmdb.org/3/movie/{movie_id}/recommendations?api_key={api_key}&language=en-US&page=1"
                    recs_data = requests.get(recs_url, timeout=5).json()
                    tmdb_recs = recs_data.get("results", [])
                    
                    if tmdb_recs:
                        fallback_results = []
                        for item in tmdb_recs[:n]:
                            title = item.get("title", "")
                            if not title:
                                continue
                            poster_path = item.get("poster_path")
                            poster = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else FALLBACK_POSTER
                            rating = str(round(item.get("vote_average", 0), 1)) if item.get("vote_average") else "N/A"
                            date_field = item.get("release_date", "")
                            year = date_field[:4] if date_field else "N/A"
                            
                            rec_item = {"title": title, "poster": poster, "rating": rating, "year": year}
                            _inject_novaflix_rating(title, rec_item)
                            fallback_results.append(rec_item)
                            
                        return fallback_results
            except Exception:
                pass
            
            # If TMDB fails or returns empty, fallback to random trending
            import random

            trending = get_trending_movies(category, limit=n * 2)
            # Filter out the movie itself
            filtered = [m for m in trending if m["title"].lower() != movie.lower()]
            random.shuffle(filtered)
            return filtered[:n]

        target_genres = set(m_row.iloc[0].get("genres", []))

        candidates = []
        for idx, row in movies_df.iterrows():
            title = row["title"]
            if title == movie:
                continue
            genres = set(row.get("genres", []))
            overlap = len(target_genres.intersection(genres))
            if overlap > 0:
                candidates.append((title, overlap))

        candidates.sort(key=lambda x: x[1], reverse=True)

        from concurrent.futures import ThreadPoolExecutor

        def fetch_wrapper(item):
            title, _ = item
            poster, rating, year = fetch_poster(title)
            return {"title": title, "poster": poster, "rating": rating, "year": year}

        with ThreadPoolExecutor(
            max_workers=min(n, len(candidates) if candidates else 1)
        ) as executor:
            results = list(executor.map(fetch_wrapper, candidates[:n]))
        return results
    except Exception:
        return []


def recommend(movie: str, similarity_file: str, n: int = 10) -> list:
    """Return list of {title, poster, rating, year} dicts."""

    # Map similarity file to a trending category for fallback
    cat_map = {
        "similarity_tags_tags.pkl": "daily",
        "similarity_tags_genres.pkl": "weekly",
        "similarity_tags_tcast.pkl": "top_rated",
        "similarity_tags_tcrew.pkl": "recent",
    }
    fallback_cat = cat_map.get(similarity_file, "daily")

    # Resolve canonical casing before lookup
    movie = _resolve_title(movie)

    new_df = load_new_df()
    sim = load_similarity_matrix(similarity_file)
    if sim is None:
        return get_fallback_recommendations(movie, n, fallback_cat)
    try:
        idx = new_df[new_df["title"] == movie].index[0]
    except IndexError:
        return get_fallback_recommendations(movie, n, fallback_cat)

    if idx >= len(sim):
        return get_fallback_recommendations(movie, n)

    deleted = _get_deleted_movies()

    movie_list = sorted(list(enumerate(sim[idx])), reverse=True, key=lambda x: x[1])[
        1 : n + len(deleted) + 20
    ]

    from concurrent.futures import ThreadPoolExecutor

    def fetch_wrapper(item):
        i, _ = item
        if i >= len(new_df):
            return None
        title = new_df.iloc[i]["title"]
        if title in deleted:
            return None
        poster, rating, year = fetch_poster(title)
        return {"title": title, "poster": poster, "rating": rating, "year": year}

    with ThreadPoolExecutor(
        max_workers=min(n + 10, len(movie_list) if movie_list else 1)
    ) as executor:
        raw_results = list(executor.map(fetch_wrapper, movie_list))

    results = [r for r in raw_results if r is not None]
    return results[:n]


def recommend_by_studio(movie: str, n: int = 15) -> list:
    # Resolve canonical casing before lookup
    movie = _resolve_title(movie)

    movies_df = load_movies_df()
    m_row = movies_df[movies_df["title"] == movie]
    if m_row.empty:
        return []
    
    target_studio = set(m_row.iloc[0].get("production_companies", m_row.iloc[0].get("prduction_comp", [])))
    if not target_studio:
        return []
        
    candidates = []
    for idx, row in movies_df.iterrows():
        title = row["title"]
        if title == movie:
            continue
        studios = set(row.get("production_companies", row.get("prduction_comp", [])))
        overlap = len(target_studio.intersection(studios))
        if overlap > 0:
            candidates.append((title, overlap))
            
    candidates.sort(key=lambda x: x[1], reverse=True)
    
    from concurrent.futures import ThreadPoolExecutor
    def fetch_wrapper(item):
        title, _ = item
        poster, rating, year = fetch_poster(title)
        return {"title": title, "poster": poster, "rating": rating, "year": year}

    with ThreadPoolExecutor(max_workers=min(n, len(candidates) if candidates else 1)) as executor:
        results = list(executor.map(fetch_wrapper, candidates[:n]))
    return results

def get_recommendations(movie: str) -> dict:
    """Return 5 recommendation sections with 15 items each."""
    return {
        "by_tags": recommend(movie, "similarity_tags_tags.pkl", 15),
        "by_genres": recommend(movie, "similarity_tags_genres.pkl", 15),
        "by_cast": recommend(movie, "similarity_tags_tcast.pkl", 15),
        "by_crew": recommend(movie, "similarity_tags_tcrew.pkl", 15),
        "by_studio": recommend_by_studio(movie, 15),
    }


# ── Movie details ─────────────────────────────────────────────────────────────


def _inject_novaflix_rating(title: str, result: dict):
    try:
        from processing import auth as user_auth

        users = user_auth.load_users()
        ratings = []
        for udata in users.values():
            interactions = udata.get("interactions", {})
            if title in interactions:
                r = interactions[title].get("rating")
                if r is not None:
                    ratings.append(r)
        if ratings:
            avg = sum(ratings) / len(ratings)
            result["novaflix_rating"] = round(avg, 1)
            result["novaflix_rating_count"] = len(ratings)
            r_avg = int(round(avg))
            RATING_MEANINGS = {
                10: "Masterpiece",
                9: "Incredible",
                8: "Great",
                7: "Good",
                6: "Okay",
                5: "Average",
                4: "Subpar",
                3: "Bad",
                2: "Awful",
                1: "Abysmal",
            }
            result["novaflix_rating_text"] = RATING_MEANINGS.get(r_avg, "Average")
        else:
            imdb_val = result.get("rating", "N/A")
            try:
                result["novaflix_rating"] = (
                    round(float(imdb_val) - 0.2, 1) if imdb_val != "N/A" else "N/A"
                )
            except Exception:
                result["novaflix_rating"] = "N/A"
            result["novaflix_rating_count"] = 0
            result["novaflix_rating_text"] = "No ratings yet"
    except Exception:
        imdb_val = result.get("rating", "N/A")
        try:
            result["novaflix_rating"] = (
                round(float(imdb_val) - 0.2, 1) if imdb_val != "N/A" else "N/A"
            )
        except Exception:
            result["novaflix_rating"] = "N/A"
        result["novaflix_rating_count"] = 0
        result["novaflix_rating_text"] = "No ratings yet"


def _detect_franchise(title: str) -> str | None:
    try:
        movies2 = load_movies2_df()
        all_titles = [t.lower() for t in movies2["title"].tolist()]
        tl = title.lower()

        # 1) Split on colon, dash, or long dash
        parts = re.split(r"\s*[:;\u2013\u2014-]\s*", title)
        if len(parts) > 1:
            base = parts[0].strip()
            # Check if other movies share this base (as startswidth OR contains)
            matches = [
                t for t in all_titles if t.startswith(base.lower()) or base.lower() in t
            ]
            if len(matches) > 1:
                return base

        # 2) Remove trailing sequel keywords / numbers / roman numerals
        cleaned = re.sub(
            r"\s+(2|3|4|5|II|III|IV|V|VI|VII|VIII|IX|X|Part\s+\w+|Rises|Returns|Revenge|Reloaded|Revolution|Legacy|Begins|Reborn|Awakens|Last|First|Final)$",
            "",
            title,
            flags=re.I,
        ).strip()
        if cleaned and cleaned.lower() != tl:
            matches = [
                t
                for t in all_titles
                if t.startswith(cleaned.lower()) or cleaned.lower() in t
            ]
            if len(matches) > 1:
                return cleaned

        # 3) Try first two words as franchise (e.g. "Harry Potter", "Mission Impossible", "Spider-Man")
        words = title.split()
        if len(words) >= 2:
            two_word = " ".join(words[:2])
            matches = [
                t
                for t in all_titles
                if t.startswith(two_word.lower()) or two_word.lower() in t
            ]
            if len(matches) > 1:
                return two_word

        # 4) Last resort: if title has a colon, just return pre-colon part
        if len(parts) > 1:
            return parts[0].strip()
    except Exception:
        pass
    return None


def clean_for_compare(title: str) -> str:
    t = title.lower()
    t = re.sub(r"^(the|a|an)\s+", "", t)
    t = re.sub(r"[^a-z0-9\s]", "", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def get_franchise_movies(title: str) -> list:
    from concurrent.futures import ThreadPoolExecutor

    base_name = _detect_franchise(title)
    if not base_name:
        parts = re.split(r"\s*[:;\u2013\u2014-]\s*", title)
        base = parts[0].strip()
        base_cleaned = re.sub(
            r"\s+(2|3|4|5|6|7|8|9|10|II|III|IV|V|VI|VII|VIII|IX|X|Part\s+\w+|Chapter\s+\d+|Rises|Returns|Revenge|Reloaded|Revolution|Legacy|Begins|Reborn|Awakens|Last|First|Final)$",
            "",
            base,
            flags=re.I,
        ).strip()
        if len(base_cleaned) >= 3:
            base_name = base_cleaned
        else:
            base_name = title

    if not base_name or len(base_name) < 2:
        return []

    orig_genres = []
    try:
        movies = load_movies_df()
        b = movies[movies["title"] == title]
        if not b.empty:
            orig_genres = [g.lower() for g in b["genres"].iloc[0]]
    except Exception:
        pass

    if not orig_genres:
        for key in OMDB_KEYS:
            try:
                url = f"http://www.omdbapi.com/?t={requests.utils.quote(title)}&apikey={key}"
                data = requests.get(url, timeout=5).json()
                if data.get("Response") == "True":
                    orig_genres = [
                        g.strip().lower()
                        for g in data.get("Genre", "").split(",")
                        if g.strip()
                    ]
                    break
            except Exception:
                continue

    is_orig_animation = "animation" in orig_genres

    results = []
    seen_titles = set()

    try:
        movies2 = load_movies2_df()
        all_titles = movies2["title"].tolist()
        b_clean = clean_for_compare(base_name)
        for t in all_titles:
            if clean_for_compare(t).startswith(b_clean):
                t_low = t.lower()
                if t_low not in [s.lower() for s in seen_titles]:
                    seen_titles.add(t)
                    poster, rating, year = fetch_poster(t)
                    results.append(
                        {
                            "title": t,
                            "poster": poster,
                            "rating": rating,
                            "year": year,
                            "source": "local",
                        }
                    )
    except Exception:
        pass

    search_query = base_name
    search_query_cleaned = re.sub(
        r"^(the|a|an)\s+", "", search_query, flags=re.I
    ).strip()

    for key in OMDB_KEYS:
        try:
            url = f"http://www.omdbapi.com/?s={requests.utils.quote(search_query_cleaned)}&type=movie&apikey={key}"
            data = requests.get(url, timeout=5).json()
            if data.get("Response") == "True":
                search_results = data.get("Search", [])
                for item in search_results:
                    t = item.get("Title")
                    if not t:
                        continue

                    t_clean = clean_for_compare(t)
                    b_clean = clean_for_compare(base_name)

                    if t_clean.startswith(b_clean):
                        t_low = t.lower()
                        if t_low not in [s.lower() for s in seen_titles]:
                            seen_titles.add(t)
                            poster = item.get("Poster")
                            if poster == "N/A" or not poster:
                                poster = FALLBACK_POSTER
                            results.append(
                                {
                                    "title": t,
                                    "poster": poster,
                                    "rating": "N/A",
                                    "year": item.get("Year", "N/A"),
                                    "imdbID": item.get("imdbID"),
                                    "source": "omdb",
                                }
                            )
                break
        except Exception:
            continue

    if len(results) <= 1:
        return []

    def parse_year(y):
        try:
            m = re.search(r"\d{4}", y)
            return int(m.group(0)) if m else 9999
        except Exception:
            return 9999

    try:
        movies2 = load_movies2_df()
        local_ratings = dict(zip(movies2["title"].str.lower(), movies2["vote_average"]))
    except Exception:
        local_ratings = {}

    filtered_results = []

    def fetch_rating_and_provider(item):
        title = item["title"]
        t_low = title.lower()

        if t_low in local_ratings:
            item["rating"] = str(round(local_ratings[t_low], 1))

        item["provider"] = get_primary_provider(title)

        if (item["rating"] == "N/A" or not item["rating"]) and item.get("imdbID"):
            for key in OMDB_KEYS:
                try:
                    url = f"http://www.omdbapi.com/?i={item['imdbID']}&apikey={key}"
                    data = requests.get(url, timeout=3).json()
                    if data.get("Response") == "True":
                        item["rating"] = data.get("imdbRating", "N/A")
                        item["genre"] = data.get("Genre", "")
                        if data.get("Poster") and data.get("Poster") != "N/A":
                            item["poster"] = data.get("Poster")
                        break
                except Exception:
                    continue

        _inject_novaflix_rating(title, item)

    with ThreadPoolExecutor(max_workers=min(10, len(results))) as executor:
        list(executor.map(fetch_rating_and_provider, results))

    title_clean_orig = clean_for_compare(title)

    for item in results:
        t_clean_item = clean_for_compare(item["title"])

        unrelated_kws = [
            "airbender",
            "lego",
            "parody",
            "documentary",
            "behind the scenes",
            "making of",
            "creating the world",
            "special edition",
            "spirits",
            "20/20",
        ]
        is_unrelated = False
        for kw in unrelated_kws:
            if kw in t_clean_item and kw not in title_clean_orig:
                is_unrelated = True
                break
        if is_unrelated:
            continue

        item_genres = [
            g.strip().lower() for g in item.get("genre", "").split(",") if g.strip()
        ]
        if not is_orig_animation and "animation" in item_genres:
            continue

        filtered_results.append(item)

    filtered_results = sorted(filtered_results, key=lambda x: parse_year(x["year"]))

    if len(filtered_results) <= 1:
        return []

    return filtered_results


def get_movie_details(title: str) -> dict:
    # Resolve to canonical casing so case-mismatched titles still hit local data
    canonical = _resolve_title(title)

    if canonical in _details_cache:
        result = dict(_details_cache[canonical])
        _inject_novaflix_rating(canonical, result)
        return result

    # Use canonical title for all local lookups; keep the user-supplied title
    # for the OMDB query so the original phrasing is preserved as a fallback.
    movies = load_movies_df()
    movies2 = load_movies2_df()

    a = movies2[movies2["title"] == canonical]
    b = movies[movies["title"] == canonical]

    local = {}
    if not a.empty:
        local["budget"] = (
            int(a.iloc[0]["budget"]) if pd.notna(a.iloc[0]["budget"]) else 0
        )
        local["revenue"] = (
            int(a.iloc[0]["revenue"]) if pd.notna(a.iloc[0]["revenue"]) else 0
        )
        local["runtime"] = (
            int(a.iloc[0]["runtime"]) if pd.notna(a.iloc[0]["runtime"]) else 0
        )
        local["release_date"] = str(a.iloc[0]["release_date"])
        local["vote_average"] = (
            float(a.iloc[0]["vote_average"])
            if pd.notna(a.iloc[0]["vote_average"])
            else 0
        )

    genres, director, cast_list = [], "N/A", []
    if not b.empty:
        genres = b["genres"].iloc[0] if "genres" in b.columns else []
        director = b["director"].iloc[0] if "director" in b.columns else "N/A"
        try:
            cast_raw = b["cast"].iloc[0]
            if isinstance(cast_raw, str):
                import ast

                cast_data = ast.literal_eval(cast_raw)
                cast_list = [a.get("name") for a in cast_data][:20]
        except Exception:
            pass

    # OMDB fetch
    omdb = {}
    for key in OMDB_KEYS:
        try:
            url = f"http://www.omdbapi.com/?t={requests.utils.quote(title)}&plot=full&apikey={key}"
            data = requests.get(url, timeout=5).json()
            if data.get("Response") == "True":
                omdb = data
                break
        except Exception:
            continue

    fallback_poster, fallback_rating, fallback_year = fetch_poster(title)

    poster = omdb.get("Poster") or fallback_poster
    if poster == "N/A" or poster == FALLBACK_POSTER:
        poster = fallback_poster

    rating_val = omdb.get("imdbRating") or str(local.get("vote_average", "N/A"))
    if rating_val == "N/A" and fallback_rating != "N/A":
        rating_val = fallback_rating

    year_val = omdb.get("Year") or str(local.get("release_date", "N/A"))[:4]
    if (year_val == "N/A" or not year_val) and fallback_year != "N/A":
        year_val = fallback_year

    # Prefer canonical title in output; fall back to user-supplied if not resolved
    display_title = canonical if canonical != title else title
    result = {
        "title": display_title,
        "poster": poster,
        "plot": omdb.get("Plot") or local.get("overview", "No description available."),
        "rating": rating_val,
        "votes": omdb.get("imdbVotes", "N/A"),
        "year": year_val,
        "runtime": omdb.get("Runtime") or f"{local.get('runtime', 'N/A')} min",
        "genre": omdb.get("Genre") or (", ".join(genres) if genres else "N/A"),
        "director": omdb.get("Director")
        or (director[0] if isinstance(director, list) and director else str(director)),
        "cast": omdb.get("Actors", "").split(", ") if omdb.get("Actors") else cast_list,
        "awards": omdb.get("Awards", "N/A"),
        "budget": local.get("budget", 0),
        "revenue": local.get("revenue", 0),
        "release_date": local.get("release_date", omdb.get("Released", "N/A")),
        "language": omdb.get("Language", "N/A"),
        "country": omdb.get("Country", "N/A"),
    }

    # Franchise detection
    franchise_movies = get_franchise_movies(display_title)
    if franchise_movies:
        result["franchise_movies"] = franchise_movies
        result["franchise"] = _detect_franchise(display_title) or display_title
    elif _detect_franchise(display_title):
        result["franchise"] = _detect_franchise(display_title)

    # Watch providers
    result["providers"] = get_primary_provider(display_title)
    _details_cache[display_title] = result

    res_copy = dict(result)
    _inject_novaflix_rating(display_title, res_copy)
    return res_copy


# ── Latest releases ───────────────────────────────────────────────────────────


def get_latest_movies() -> list:
    global _latest_cache
    if _latest_cache is not None:
        return _latest_cache
    results = []
    for imdb_id in LATEST_MOVIE_IDS:
        try:
            for key in OMDB_KEYS:
                url = f"http://www.omdbapi.com/?i={imdb_id}&apikey={key}"
                data = requests.get(url, timeout=6).json()
                if data.get("Response") == "True":
                    poster = data.get("Poster", FALLBACK_POSTER)
                    if not poster or poster == "N/A":
                        poster = FALLBACK_POSTER
                    item = {
                        "imdbID": imdb_id,
                        "title": data.get("Title", "Unknown"),
                        "year": data.get("Year", "N/A"),
                        "poster": poster,
                        "rating": data.get("imdbRating", "N/A"),
                        "genre": data.get("Genre", "N/A"),
                    }
                    _inject_novaflix_rating(data.get("Title", "Unknown"), item)
                    results.append(item)
                    break
        except Exception:
            continue
    _latest_cache = results
    return results


# ── Anime Details ────────────────────────────────────────────────────────────


def get_anime_details(title: str) -> dict:
    if title in _anime_details_cache:
        return _anime_details_cache[title]

    anime_df = load_anime_df()
    
    # 1. Resolve canonical anime title
    canonical = title
    in_db = False
    row = {}
    if not anime_df.empty:
        # Case insensitive lookup
        titles_lower = anime_df["title"].str.lower().tolist()
        if title.lower() in titles_lower:
            idx = titles_lower.index(title.lower())
            canonical = anime_df.iloc[idx]["title"]
            row = anime_df.iloc[idx]
            in_db = True
            
    # 2. Try fetching from TMDB
    tmdb_data = _tmdb_tv_fetch(canonical)
    
    # 3. OMDB fetch
    omdb = {}
    for key in OMDB_KEYS:
        try:
            url = f"http://www.omdbapi.com/?t={requests.utils.quote(canonical)}&plot=full&apikey={key}"
            data = requests.get(url, timeout=5).json()
            if data.get("Response") == "True":
                omdb = data
                break
        except Exception:
            continue
            
    # Compile the values
    poster = FALLBACK_POSTER
    if tmdb_data.get("poster_path"):
        poster = f"https://image.tmdb.org/t/p/w500{tmdb_data['poster_path']}"
    elif not row.empty and row.get("poster") and row["poster"] != FALLBACK_POSTER:
        poster = row["poster"]
    elif omdb.get("Poster") and omdb["Poster"] != "N/A":
        poster = omdb["Poster"]
        
    if poster == FALLBACK_POSTER or poster == "N/A":
        fallback_poster, _, _ = fetch_poster(canonical)
        if fallback_poster != FALLBACK_POSTER:
            poster = fallback_poster
        else:
            poster = _bing_poster(canonical + " anime")
            
    # Safe lists extraction
    def get_list(col_val):
        if isinstance(col_val, list):
            return col_val
        if isinstance(col_val, str):
            try:
                parsed = json.loads(col_val)
                if isinstance(parsed, list):
                    return parsed
            except:
                pass
            return [str(col_val)]
        return []
        
    local_genres = get_list(row.get("genres")) if in_db else []
    tmdb_genres = [g.get("name") for g in tmdb_data.get("genres", [])] if tmdb_data else []
    genres = local_genres or tmdb_genres
    
    local_networks = get_list(row.get("networks")) if in_db else []
    tmdb_networks = [n.get("name") for n in tmdb_data.get("networks", [])] if tmdb_data else []
    networks = local_networks or tmdb_networks
    
    local_creators = get_list(row.get("creators")) if in_db else []
    tmdb_creators = [c.get("name") for c in tmdb_data.get("created_by", [])] if tmdb_data else []
    creators = local_creators or tmdb_creators
    
    local_cast = get_list(row.get("top_cast")) if in_db else []
    
    # Seasons & Episodes
    seasons = 1
    if tmdb_data.get("number_of_seasons"):
        seasons = int(tmdb_data["number_of_seasons"])
    elif in_db and row.get("seasons"):
        try:
            seasons = int(row["seasons"])
        except:
            pass
    elif omdb.get("totalSeasons") and omdb["totalSeasons"] != "N/A":
        try:
            seasons = int(omdb["totalSeasons"])
        except:
            pass
        
    episodes = 1
    if tmdb_data.get("number_of_episodes"):
        episodes = int(tmdb_data["number_of_episodes"])
    elif in_db and row.get("episodes"):
        try:
            episodes = int(row["episodes"])
        except:
            pass
        
    # Runtime
    runtime_val = "N/A min"
    if in_db and row.get("episode_runtime"):
        runtime_val = f"{row['episode_runtime']} min"
    elif tmdb_data.get("episode_run_time"):
        r_list = tmdb_data["episode_run_time"]
        if r_list:
            runtime_val = f"{r_list[0]} min"
    elif omdb.get("Runtime") and omdb["Runtime"] != "N/A":
        runtime_val = omdb["Runtime"]
        
    # Rating
    rating_val = "N/A"
    if omdb.get("imdbRating") and omdb["imdbRating"] != "N/A":
        rating_val = omdb["imdbRating"]
    elif tmdb_data.get("vote_average"):
        rating_val = str(round(tmdb_data["vote_average"], 1))
    elif in_db and row.get("vote_average"):
        rating_val = str(round(row["vote_average"], 1))
        
    # Votes
    votes_val = "N/A"
    if omdb.get("imdbVotes") and omdb["imdbVotes"] != "N/A":
        votes_val = omdb["imdbVotes"]
    elif tmdb_data.get("vote_count"):
        votes_val = str(tmdb_data["vote_count"])
    elif in_db and row.get("vote_count"):
        votes_val = str(row["vote_count"])
        
    # Year
    year_val = "N/A"
    if omdb.get("Year") and omdb["Year"] != "N/A":
        year_val = omdb["Year"]
    elif tmdb_data.get("first_air_date"):
        year_val = str(tmdb_data["first_air_date"])[:4]
    elif in_db and row.get("first_air_date"):
        year_val = str(row["first_air_date"])[:4]
        
    # Director / Creator
    director_val = "N/A"
    if omdb.get("Director") and omdb["Director"] != "N/A":
        director_val = omdb["Director"]
    elif tmdb_data.get("created_by"):
        cb_list = tmdb_data["created_by"]
        if cb_list:
            director_val = cb_list[0].get("name", "N/A")
    elif creators:
        director_val = creators[0]

    result = {
        "title": canonical,
        "poster": poster,
        "plot": omdb.get("Plot") or tmdb_data.get("overview") or (row.get("overview") if in_db else "No description available."),
        "rating": rating_val,
        "votes": votes_val,
        "year": year_val,
        "runtime": runtime_val,
        "genre": omdb.get("Genre") or (", ".join(genres) if genres else "N/A"),
        "cast": omdb.get("Actors", "").split(", ") if omdb.get("Actors") else local_cast,
        "awards": omdb.get("Awards", "N/A"),
        "seasons": seasons,
        "episodes": episodes,
        "status": tmdb_data.get("status") or (row.get("status") if in_db else "N/A"),
        "creators": omdb.get("Writer", "").split(", ") if omdb.get("Writer") else creators,
        "director": director_val,
        "networks": networks,
        "providers": get_primary_provider(canonical + " anime"),
    }
    
    # Fake NovaFlix rating
    result["novaflix_rating"] = (
        round(float(result["rating"]) - 0.2, 1) if result["rating"] != "N/A" else "N/A"
    )
    result["novaflix_rating_count"] = 120
    result["novaflix_rating_text"] = (
        "Great"
        if result["novaflix_rating"] != "N/A" and result["novaflix_rating"] > 7.5
        else "Good"
    )
    
    _anime_details_cache[title] = result
    return result


def browse_anime(page: int = 1, letter: str = "All", genre: str = "All") -> dict:
    anime_df = load_anime_df()
    if anime_df.empty:
        return {"anime": [], "total": 0, "page": 1, "total_pages": 1}

    filtered = anime_df.copy()

    if letter and letter != "All":
        filtered = filtered[filtered["title"].str.upper().str.startswith(letter)]

    if genre and genre != "All":

        def has_genre(genres):
            if isinstance(genres, list):
                return any(genre.lower() in g.lower() for g in genres)
            return genre.lower() in str(genres).lower()

        filtered = filtered[filtered["genres"].apply(has_genre)]

    total = len(filtered)
    per_page = 20
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    page_df = filtered.iloc[start : start + per_page]

    results = []
    for _, row in page_df.iterrows():
        poster, rating, yr = fetch_anime_poster(row["title"])
        item = {
            "title": row["title"],
            "poster": poster,
            "rating": (
                str(round(float(row["vote_average"]), 1))
                if pd.notna(row["vote_average"])
                else "N/A"
            ),
            "year": (
                str(row["first_air_date"])[:4]
                if pd.notna(row["first_air_date"])
                else "N/A"
            ),
        }
        _inject_novaflix_rating(row["title"], item)
        results.append(item)

    return {"anime": results, "total": total, "page": page, "total_pages": total_pages}


def get_trending_anime(limit: int = 15) -> list:
    anime_df = load_anime_df()
    if anime_df.empty:
        return []

    df = anime_df.sort_values(by="popularity", ascending=False).head(limit * 3)

    from concurrent.futures import ThreadPoolExecutor

    def fetch_wrapper(title):
        poster, rating, year = fetch_anime_poster(title)
        return (title, poster, rating, year)

    titles = df["title"].tolist()
    results = []
    count = 0
    with ThreadPoolExecutor(max_workers=15) as executor:
        for title, poster, rating, year in executor.map(fetch_wrapper, titles):
            if count >= limit:
                break
            if poster != FALLBACK_POSTER:
                item = {
                    "title": title,
                    "poster": poster,
                    "rating": rating,
                    "year": year,
                }
                _inject_novaflix_rating(title, item)
                results.append(item)
                count += 1
    return results


def get_latest_anime() -> list:
    anime_df = load_anime_df()
    if anime_df.empty:
        return []
    # Sort by release date descending
    df = anime_df.sort_values(by="first_air_date", ascending=False).head(15)

    results = []
    for _, row in df.iterrows():
        poster, rating, yr = fetch_anime_poster(row["title"])
        item = {"title": row["title"], "poster": poster, "rating": rating, "year": yr}
        _inject_novaflix_rating(row["title"], item)
        results.append(item)
    return results


# ── Series Details ────────────────────────────────────────────────────────────


def get_series_details(title: str) -> dict:
    if title in _series_details_cache:
        return _series_details_cache[title]

    series_df = load_series_df()
    
    # 1. Resolve canonical series title
    canonical = title
    in_db = False
    row = {}
    if not series_df.empty:
        # Case insensitive lookup
        titles_lower = series_df["title"].str.lower().tolist()
        if title.lower() in titles_lower:
            idx = titles_lower.index(title.lower())
            canonical = series_df.iloc[idx]["title"]
            row = series_df.iloc[idx]
            in_db = True
            
    # 2. Try fetching from TMDB
    tmdb_data = _tmdb_tv_fetch(canonical)
    
    # 3. OMDB fetch
    omdb = {}
    for key in OMDB_KEYS:
        try:
            url = f"http://www.omdbapi.com/?t={requests.utils.quote(canonical)}&type=series&plot=full&apikey={key}"
            data = requests.get(url, timeout=5).json()
            if data.get("Response") == "True":
                omdb = data
                break
        except Exception:
            continue
            
    # Compile the values
    poster = FALLBACK_POSTER
    if tmdb_data.get("poster_path"):
        poster = f"https://image.tmdb.org/t/p/w500{tmdb_data['poster_path']}"
    elif not row.empty and row.get("poster") and row["poster"] != FALLBACK_POSTER:
        poster = row["poster"]
    elif omdb.get("Poster") and omdb["Poster"] != "N/A":
        poster = omdb["Poster"]
        
    if poster == FALLBACK_POSTER or poster == "N/A":
        fallback_poster, _, _ = fetch_poster(canonical)
        if fallback_poster != FALLBACK_POSTER:
            poster = fallback_poster
        else:
            poster = _bing_poster(canonical + " tv series")
            
    # Safe lists extraction
    def get_list(col_val):
        if isinstance(col_val, list):
            return col_val
        if isinstance(col_val, str):
            try:
                parsed = json.loads(col_val)
                if isinstance(parsed, list):
                    return parsed
            except:
                pass
            return [str(col_val)]
        return []
        
    local_genres = get_list(row.get("genres")) if in_db else []
    tmdb_genres = [g.get("name") for g in tmdb_data.get("genres", [])] if tmdb_data else []
    genres = local_genres or tmdb_genres
    
    local_networks = get_list(row.get("networks")) if in_db else []
    tmdb_networks = [n.get("name") for n in tmdb_data.get("networks", [])] if tmdb_data else []
    networks = local_networks or tmdb_networks
    
    local_creators = get_list(row.get("creators")) if in_db else []
    tmdb_creators = [c.get("name") for c in tmdb_data.get("created_by", [])] if tmdb_data else []
    creators = local_creators or tmdb_creators
    
    local_cast = get_list(row.get("top_cast")) if in_db else []
    
    # Seasons & Episodes
    seasons = 1
    if tmdb_data.get("number_of_seasons"):
        seasons = int(tmdb_data["number_of_seasons"])
    elif in_db and row.get("seasons"):
        try:
            seasons = int(row["seasons"])
        except:
            pass
    elif omdb.get("totalSeasons") and omdb["totalSeasons"] != "N/A":
        try:
            seasons = int(omdb["totalSeasons"])
        except:
            pass
            
    episodes = 1
    if tmdb_data.get("number_of_episodes"):
        episodes = int(tmdb_data["number_of_episodes"])
    elif in_db and row.get("episodes"):
        try:
            episodes = int(row["episodes"])
        except:
            pass
        
    # Runtime
    runtime_val = "N/A min"
    if in_db and row.get("episode_runtime"):
        runtime_val = f"{row['episode_runtime']} min"
    elif tmdb_data.get("episode_run_time"):
        r_list = tmdb_data["episode_run_time"]
        if r_list:
            runtime_val = f"{r_list[0]} min"
    elif omdb.get("Runtime") and omdb["Runtime"] != "N/A":
        runtime_val = omdb["Runtime"]
        
    # Rating
    rating_val = "N/A"
    if omdb.get("imdbRating") and omdb["imdbRating"] != "N/A":
        rating_val = omdb["imdbRating"]
    elif tmdb_data.get("vote_average"):
        rating_val = str(round(tmdb_data["vote_average"], 1))
    elif in_db and row.get("vote_average"):
        rating_val = str(round(row["vote_average"], 1))
        
    # Votes
    votes_val = "N/A"
    if omdb.get("imdbVotes") and omdb["imdbVotes"] != "N/A":
        votes_val = omdb["imdbVotes"]
    elif tmdb_data.get("vote_count"):
        votes_val = str(tmdb_data["vote_count"])
    elif in_db and row.get("vote_count"):
        votes_val = str(row["vote_count"])
        
    # Year
    year_val = "N/A"
    if omdb.get("Year") and omdb["Year"] != "N/A":
        year_val = omdb["Year"]
    elif tmdb_data.get("first_air_date"):
        year_val = str(tmdb_data["first_air_date"])[:4]
    elif in_db and row.get("first_air_date"):
        year_val = str(row["first_air_date"])[:4]
        
    # Director / Creator
    director_val = "N/A"
    if omdb.get("Director") and omdb["Director"] != "N/A":
        director_val = omdb["Director"]
    elif tmdb_data.get("created_by"):
        cb_list = tmdb_data["created_by"]
        if cb_list:
            director_val = cb_list[0].get("name", "N/A")
    elif creators:
        director_val = creators[0]

    result = {
        "title": canonical,
        "poster": poster,
        "plot": omdb.get("Plot") or tmdb_data.get("overview") or (row.get("overview") if in_db else "No description available."),
        "rating": rating_val,
        "votes": votes_val,
        "year": year_val,
        "runtime": runtime_val,
        "genre": omdb.get("Genre") or (", ".join(genres) if genres else "N/A"),
        "cast": omdb.get("Actors", "").split(", ") if omdb.get("Actors") else local_cast,
        "awards": omdb.get("Awards", "N/A"),
        "seasons": seasons,
        "episodes": episodes,
        "status": tmdb_data.get("status") or (row.get("status") if in_db else "N/A"),
        "creators": omdb.get("Writer", "").split(", ") if omdb.get("Writer") else creators,
        "director": director_val,
        "networks": networks,
        "providers": get_primary_provider(canonical + " series"),
    }
    
    # Fake NovaFlix rating
    result["novaflix_rating"] = (
        round(float(result["rating"]) - 0.2, 1) if result["rating"] != "N/A" else "N/A"
    )
    result["novaflix_rating_count"] = 120
    result["novaflix_rating_text"] = (
        "Great"
        if result["novaflix_rating"] != "N/A" and result["novaflix_rating"] > 7.5
        else "Good"
    )
    
    _series_details_cache[title] = result
    return result


def browse_series(page: int = 1, letter: str = "All", genre: str = "All") -> dict:
    series_df = load_series_df()
    if series_df.empty:
        return {"series": [], "total": 0, "page": 1, "total_pages": 1}

    filtered = series_df.copy()

    if letter and letter != "All":
        filtered = filtered[filtered["title"].str.upper().str.startswith(letter)]

    if genre and genre != "All":

        def has_genre(genres):
            if isinstance(genres, list):
                return any(genre.lower() in g.lower() for g in genres)
            return genre.lower() in str(genres).lower()

        filtered = filtered[filtered["genres"].apply(has_genre)]

    total = len(filtered)
    per_page = 20
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    page_df = filtered.iloc[start : start + per_page]

    results = []
    for _, row in page_df.iterrows():
        poster, rating, yr = fetch_series_poster(row["title"])
        item = {
            "title": row["title"],
            "poster": poster,
            "rating": (
                str(round(float(row["vote_average"]), 1))
                if pd.notna(row["vote_average"])
                else "N/A"
            ),
            "year": (
                str(row["first_air_date"])[:4]
                if pd.notna(row["first_air_date"])
                else "N/A"
            ),
        }
        _inject_novaflix_rating(row["title"], item)
        results.append(item)

    return {"series": results, "total": total, "page": page, "total_pages": total_pages}


def get_trending_series(limit: int = 15) -> list:
    series_df = load_series_df()
    if series_df.empty:
        return []

    df = series_df.sort_values(by="popularity", ascending=False).head(limit * 3)

    from concurrent.futures import ThreadPoolExecutor

    def fetch_wrapper(title):
        poster, rating, year = fetch_series_poster(title)
        return (title, poster, rating, year)

    titles = df["title"].tolist()
    results = []
    count = 0
    with ThreadPoolExecutor(max_workers=15) as executor:
        for title, poster, rating, year in executor.map(fetch_wrapper, titles):
            if count >= limit:
                break
            if poster != FALLBACK_POSTER:
                item = {
                    "title": title,
                    "poster": poster,
                    "rating": rating,
                    "year": year,
                }
                _inject_novaflix_rating(title, item)
                results.append(item)
                count += 1
    return results


def get_latest_series() -> list:
    series_df = load_series_df()
    if series_df.empty:
        return []
    # Sort by release date descending
    df = series_df.sort_values(by="first_air_date", ascending=False).head(15)

    results = []
    for _, row in df.iterrows():
        poster, rating, yr = fetch_series_poster(row["title"])
        item = {"title": row["title"], "poster": poster, "rating": rating, "year": yr}
        _inject_novaflix_rating(row["title"], item)
        results.append(item)
    return results


# ── Trending Movies ───────────────────────────────────────────────────────────


def get_trending_movies(category: str = "daily", limit: int = 15) -> list:
    movies2_df = load_movies2_df()

    if category == "top_rated":
        df = movies2_df[
            pd.to_numeric(movies2_df["vote_count"], errors="coerce").fillna(0) > 1000
        ].sort_values(by="vote_average", ascending=False)
    elif category == "recent":
        df = movies2_df.sort_values(by="release_date", ascending=False)
    elif category in ["daily", "weekly", "monthly", "region", "hidden_gems"]:
        # Mock some dynamic behavior based on category and current date
        import hashlib

        salt = datetime.datetime.now().strftime(f"%Y-%m-%d-{category}")
        df = movies2_df.copy()
        df["hash"] = df["title"].apply(
            lambda t: int(
                hashlib.md5((str(t) + salt).encode("utf-8")).hexdigest()[:8], 16
            )
        )

        if category == "hidden_gems":
            # high vote_average, low popularity, sorted by hash
            df = df[pd.to_numeric(df["vote_average"], errors="coerce").fillna(0) > 7.0]
            df = df[pd.to_numeric(df["popularity"], errors="coerce").fillna(0) < 20]

        df = df.sort_values(by="hash", ascending=False)
    else:  # trending default
        df = movies2_df.sort_values(by="popularity", ascending=False)

    df = df.head(limit * 3)

    from concurrent.futures import ThreadPoolExecutor

    def fetch_wrapper(title):
        poster, rating, year = fetch_poster(title)
        return (title, poster, rating, year)

    titles = df["title"].tolist()
    results = []
    count = 0
    with ThreadPoolExecutor(max_workers=15) as executor:
        for title, poster, rating, year in executor.map(fetch_wrapper, titles):
            if count >= limit:
                break
            if poster != FALLBACK_POSTER:
                item = {
                    "title": title,
                    "poster": poster,
                    "rating": rating,
                    "year": year,
                }
                _inject_novaflix_rating(title, item)
                results.append(item)
                count += 1
    return results


# ── OMDB search ───────────────────────────────────────────────────────────────


def search_movies(query: str, limit: int = 15) -> list:
    q = query.lower()
    movies_df = load_movies_df()

    scored = []
    # Using itertuples for speed
    for row in movies_df.itertuples(index=False):
        title = str(getattr(row, "title", "")).lower()

        genres_attr = getattr(row, "genres", [])
        genres = (
            " ".join(genres_attr).lower()
            if isinstance(genres_attr, list)
            else str(genres_attr).lower()
        )

        director_attr = getattr(row, "director", [])
        director = (
            " ".join(director_attr).lower()
            if isinstance(director_attr, list)
            else str(director_attr).lower()
        )

        cast_attr = getattr(row, "top_cast", getattr(row, "cast", []))
        cast = (
            " ".join(cast_attr).lower()
            if isinstance(cast_attr, list)
            else str(cast_attr).lower()
        )

        keywords_attr = getattr(row, "keywords", [])
        keywords = (
            " ".join(keywords_attr).lower()
            if isinstance(keywords_attr, list)
            else str(keywords_attr).lower()
        )

        score = 0
        if q == title:
            score += 100
        elif q in title:
            score += 50
        elif q in director:
            score += 30
        elif q in cast:
            score += 20
        elif q in genres:
            score += 10
        elif q in keywords:
            score += 5

        if score > 0:
            scored.append((getattr(row, "title", ""), score))

    scored.sort(key=lambda x: x[1], reverse=True)

    results = []
    seen = set()
    for title, score in scored:
        if title in seen:
            continue
        seen.add(title)

        if len(results) >= limit:
            break

        poster, rating, year = fetch_poster(title)
        item = {"title": title, "poster": poster, "rating": rating, "year": year}
        _inject_novaflix_rating(title, item)
        results.append(item)

    if len(results) < limit:
        try:
            for key in OMDB_KEYS:
                url = f"http://www.omdbapi.com/?s={requests.utils.quote(query)}&type=movie&apikey={key}"
                data = requests.get(url, timeout=4).json()
                if data.get("Response") == "True":
                    for search_item in data.get("Search", []):
                        title = search_item.get("Title")
                        if not title or title in seen:
                            continue
                        seen.add(title)

                        if len(results) >= limit:
                            break

                        # Use fetch_poster to get consistent poster/rating caching
                        poster, rating, year = fetch_poster(title)
                        if poster == FALLBACK_POSTER and search_item.get(
                            "Poster"
                        ) not in ["N/A", "", None]:
                            poster = search_item.get("Poster")
                        if year == "N/A":
                            year = search_item.get("Year", "N/A")

                        item = {
                            "title": title,
                            "poster": poster,
                            "rating": rating,
                            "year": year,
                        }
                        _inject_novaflix_rating(title, item)
                        results.append(item)
                    break
        except Exception:
            pass

    return results


# ── Browse (paged) ────────────────────────────────────────────────────────────


def browse_movies(page: int = 1, letter: str = "All", year: str = "") -> dict:
    movies = load_movies2_df()
    filtered = movies[["title", "release_date", "vote_average"]].copy()

    if letter and letter != "All":
        filtered = filtered[filtered["title"].str.upper().str.startswith(letter)]
    if year:
        filtered = filtered[filtered["release_date"].astype(str).str.startswith(year)]

    total = len(filtered)
    per_page = 20
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    page_df = filtered.iloc[start : start + per_page]

    results = []
    for _, row in page_df.iterrows():
        poster, rating, yr = fetch_poster(row["title"])
        item = {
            "title": row["title"],
            "poster": poster,
            "rating": (
                str(round(float(row["vote_average"]), 1))
                if pd.notna(row["vote_average"])
                else "N/A"
            ),
            "year": (
                str(row["release_date"])[:4] if pd.notna(row["release_date"]) else "N/A"
            ),
        }
        _inject_novaflix_rating(row["title"], item)
        results.append(item)

    return {"movies": results, "total": total, "page": page, "total_pages": total_pages}


# ── Providers ─────────────────────────────────────────────────────────────────


def get_primary_provider(title: str) -> dict:
    h = int(hashlib.md5(title.encode("utf-8")).hexdigest(), 16)
    return PROVIDERS[h % len(PROVIDERS)]


# ── YouTube trailer search ─────────────────────────────────────────────────────

_TRAILER_CACHE: dict = {}


def search_youtube_trailer(query: str) -> str | None:
    key = query.lower().strip()
    if key in _TRAILER_CACHE:
        return _TRAILER_CACHE[key]
    try:
        search_url = f"https://www.youtube.com/results?search_query={requests.utils.quote(query)}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = requests.get(search_url, headers=headers, timeout=8)
        html = resp.text
        # Find first video ID in the format /watch?v=VIDEO_ID
        match = re.search(r"/watch\?v=([a-zA-Z0-9_-]{11})", html)
        if match:
            vid = match.group(1)
            _TRAILER_CACHE[key] = vid
            return vid
    except Exception:
        pass
    _TRAILER_CACHE[key] = None
    return None


_SCREENSHOTS_CACHE: dict = {}


def get_screenshots(movie_name: str) -> list:
    key = movie_name.lower().strip()
    if key in _SCREENSHOTS_CACHE:
        return _SCREENSHOTS_CACHE[key]

    # 1. Try TMDB Images
    try:
        api_key = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
        search_url = f"https://api.tmdb.org/3/search/movie?api_key={api_key}&query={requests.utils.quote(movie_name)}&language=en-US&page=1"
        search_data = requests.get(search_url, timeout=5).json()
        if search_data.get("results"):
            movie_id = search_data["results"][0]["id"]
            images_url = f"https://api.tmdb.org/3/movie/{movie_id}/images?api_key={api_key}"
            images_data = requests.get(images_url, timeout=5).json()
            backdrops = images_data.get("backdrops", [])
            if backdrops:
                urls = [f"https://image.tmdb.org/t/p/w780{b['file_path']}" for b in backdrops[:6]]
                _SCREENSHOTS_CACHE[key] = urls
                return urls
    except Exception:
        pass

    # 2. Fallback to Bing Images scraper
    try:
        import urllib.parse
        import urllib.request
        url = f"https://www.bing.com/images/search?q={urllib.parse.quote_plus(movie_name + ' movie screencap 1080p wallpaper')}"
        headers = {"User-Agent": "Mozilla/5.0"}
        req = urllib.request.Request(url, headers=headers)
        html = urllib.request.urlopen(req, timeout=5).read().decode("utf-8")
        imgs = re.findall(r"murl&quot;:&quot;(.*?)&quot;", html)
        valid_imgs = [img for img in imgs if img.startswith("http")]
        if valid_imgs:
            urls = valid_imgs[:6]
            _SCREENSHOTS_CACHE[key] = urls
            return urls
    except Exception as e:
        print("Screenshot error:", e)

    _SCREENSHOTS_CACHE[key] = []
    return []


# ── Person details ────────────────────────────────────────────────────────────


def get_person_details(name: str) -> dict:
    if name in _person_cache:
        return _person_cache[name]
    
    bio, image = "No biography available.", FALLBACK_PERSON
    extra = {"dob": "N/A", "age": "N/A", "country": "N/A", "insta": None}
    
    try:
        api_key = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
        search_url = f"https://api.tmdb.org/3/search/person?api_key={api_key}&query={requests.utils.quote(name)}&page=1"
        data = requests.get(search_url, timeout=5).json()
        results = data.get("results", [])
        
        if results:
            person_id = results[0]["id"]
            
            # Get person details
            details_url = f"https://api.tmdb.org/3/person/{person_id}?api_key={api_key}"
            details = requests.get(details_url, timeout=5).json()
            
            # Get external ids
            ext_url = f"https://api.tmdb.org/3/person/{person_id}/external_ids?api_key={api_key}"
            ext_data = requests.get(ext_url, timeout=5).json()
            
            if details.get("biography"):
                raw_bio = details["biography"]
                bio = raw_bio[:800] + ("..." if len(raw_bio) > 800 else "")
                
            if details.get("profile_path"):
                image = f"https://image.tmdb.org/t/p/w500{details['profile_path']}"
                
            if details.get("birthday"):
                extra["dob"] = details["birthday"]
                
            if details.get("place_of_birth"):
                extra["country"] = details["place_of_birth"]
                
            if ext_data.get("instagram_id"):
                extra["insta"] = ext_data["instagram_id"]
    except Exception:
        pass
        
    # Known movies
    try:
        movies_df = load_movies_df()
        
        def is_person_involved(row, p_name):
            p_name_lower = p_name.lower()
            cast_list = row.get("top_cast")
            if isinstance(cast_list, list) and any(p_name_lower == str(actor).lower() for actor in cast_list):
                return True
            director_val = row.get("director")
            if isinstance(director_val, list):
                if any(p_name_lower == str(d).lower() for d in director_val):
                    return True
            elif isinstance(director_val, str):
                if p_name_lower == director_val.lower():
                    return True
            return False

        movies_df["has_person"] = movies_df.apply(lambda r: is_person_involved(r, name), axis=1)
        known_for_titles = movies_df[movies_df["has_person"]]["title"].tolist()[:8]

        from concurrent.futures import ThreadPoolExecutor

        def fetch_wrapper(title):
            poster, rating, year = fetch_poster(title)
            return (title, poster, rating, year)

        known_for = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            for title, poster, rating, year in executor.map(
                fetch_wrapper, known_for_titles
            ):
                item = {
                    "title": title,
                    "poster": poster,
                    "rating": rating,
                    "year": year,
                }
                _inject_novaflix_rating(title, item)
                known_for.append(item)
    except Exception:
        known_for = []

    result = {"name": name, "bio": bio, "image": image, "known_for": known_for, **extra}
    _person_cache[name] = result
    return result


def get_movie_index(title: str) -> int:
    new_df = load_new_df()
    try:
        return new_df[new_df["title"] == title].index[0]
    except IndexError:
        return -1


def get_personalized_recs(username: str, limit: int = 20) -> list:
    import random

    from processing import auth as user_auth

    users = user_auth.load_users()
    user_data = users.get(username, {})

    wishlist = user_data.get("wishlist", [])
    watched_list = user_data.get("watched_list", [])

    # 1. Exclude watched movies
    watched_set = set(watched_list)

    new_df = load_new_df()
    movies_df = load_movies_df()
    movies2_df = load_movies2_df()

    # Load similarity tags matrix if wishlist is not empty
    sim_tags = None
    wishlist_indices = []
    if wishlist:
        sim_tags = load_similarity_matrix("similarity_tags_tags.pkl")
        for title in wishlist:
            idx = get_movie_index(title)
            if idx != -1:
                wishlist_indices.append(idx)

    # Build user profile preferences based on wishlist + watched lists
    genre_counts = {}
    director_counts = {}
    cast_counts = {}

    for title in wishlist + watched_list:
        m_row = movies_df[movies_df["title"] == title]
        if not m_row.empty:
            genres = m_row.iloc[0].get("genres", [])
            for g in genres:
                genre_counts[g] = genre_counts.get(g, 0) + 1
            directors = m_row.iloc[0].get("director", [])
            if isinstance(directors, list):
                for d in directors:
                    director_counts[d] = director_counts.get(d, 0) + 1
            elif isinstance(directors, str) and directors != "N/A":
                director_counts[directors] = director_counts.get(directors, 0) + 1
            cast = m_row.iloc[0].get("top_cast", [])
            if isinstance(cast, list):
                for c in cast:
                    cast_counts[c] = cast_counts.get(c, 0) + 1

    # Boost based on recent activity stream
    try:
        from processing import activity_store

        recent_activity = activity_store.get_timeline(username, limit=30)
        for act in recent_activity:
            if act.get("movie_title"):
                m_row = movies_df[movies_df["title"] == act["movie_title"]]
                if not m_row.empty:
                    # Give an extra 2 points for recent interactions
                    for g in m_row.iloc[0].get("genres", []):
                        genre_counts[g] = genre_counts.get(g, 0) + 2
    except Exception as e:
        print("Activity boost error:", e)

    # Load subscribed celebrity names for 40% recommendation boost
    subscribed_directors = set()
    subscribed_cast = set()
    try:
        from processing import celebrity_store

        sub_names = celebrity_store.get_subscribed_names(username)
        subscribed_directors = set(sub_names.get("directors", []))
        subscribed_cast = set(
            sub_names.get("actors", []) + sub_names.get("actresses", [])
        )
    except Exception as e:
        print("Celebrity subscription boost error:", e)

    # Normalize profile weights
    total_genres = sum(genre_counts.values()) or 1
    total_directors = sum(director_counts.values()) or 1
    total_cast = sum(cast_counts.values()) or 1

    genre_weights = {k: v / total_genres for k, v in genre_counts.items()}
    director_weights = {k: v / total_directors for k, v in director_counts.items()}
    cast_weights = {k: v / total_cast for k, v in cast_counts.items()}

    # Load onboarding preferences for personalization
    preferences = user_data.get("preferences", {})
    pref_categories = [c.lower() for c in preferences.get("categories", [])]
    pref_actors = [a.lower() for a in preferences.get("actors", [])]
    pref_actresses = [a.lower() for a in preferences.get("actresses", [])]
    pref_directors = [d.lower() for d in preferences.get("directors", [])]
    pref_studios = [s.lower() for s in preferences.get("studios", [])]
    pref_creators = set(pref_actors + pref_actresses + pref_directors)

    # Score all candidate movies
    scored_movies = []

    for idx, row in new_df.iterrows():
        title = row["title"]
        if title in watched_set:
            continue

        score = 0.0

        # 1. Wishlist Similarity (Highest Priority)
        if wishlist_indices and sim_tags is not None:
            similarities = []
            for w_idx in wishlist_indices:
                if w_idx < len(sim_tags) and idx < len(sim_tags[w_idx]):
                    similarities.append(sim_tags[w_idx][idx])
            if similarities:
                score += max(similarities) * 8.0  # High weight

        # 2. User Profile Interest (Highest Priority)
        m_row = movies_df[movies_df["title"] == title]
        if not m_row.empty:
            m_genres = m_row.iloc[0].get("genres", [])
            m_directors = m_row.iloc[0].get("director", [])
            m_cast = m_row.iloc[0].get("top_cast", [])

            # Genre match
            genre_match = sum(genre_weights.get(g, 0) for g in m_genres)
            score += genre_match * 2.5

            # Director match
            if isinstance(m_directors, list):
                director_match = sum(director_weights.get(d, 0) for d in m_directors)
            elif isinstance(m_directors, str):
                director_match = director_weights.get(m_directors, 0)
            else:
                director_match = 0
            score += director_match * 1.5

            # Cast match
            if isinstance(m_cast, list):
                cast_match = sum(cast_weights.get(c, 0) for c in m_cast)
            else:
                cast_match = 0
            score += cast_match * 1.0

            # ── Onboarding Preferences Boost ──
            # Category/Genre Match
            cat_matches = 0
            for g in m_genres:
                g_lower = g.lower()
                for cat in pref_categories:
                    if cat in g_lower or g_lower in cat:
                        cat_matches += 1
            if cat_matches > 0:
                score += cat_matches * 2.0

            # Creator (Actor/Actress/Director) Match
            creator_matches = 0
            if isinstance(m_directors, list):
                creator_matches += sum(1 for d in m_directors if d.lower() in pref_creators)
            elif isinstance(m_directors, str) and m_directors.lower() in pref_creators:
                creator_matches += 1
            if isinstance(m_cast, list):
                creator_matches += sum(1 for c in m_cast if c.lower() in pref_creators)
            if creator_matches > 0:
                score += creator_matches * 2.5

            # Studio/Production Company Match
            studio_matches = 0
            m2_row = movies2_df[movies2_df["title"] == title]
            if not m2_row.empty and "production_companies" in m2_row.columns:
                try:
                    import ast
                    raw_companies = m2_row.iloc[0]["production_companies"]
                    if isinstance(raw_companies, str):
                        companies_list = ast.literal_eval(raw_companies)
                        for c_info in companies_list:
                            if isinstance(c_info, dict) and "name" in c_info:
                                c_name = c_info["name"].lower()
                                if any(s in c_name for s in pref_studios):
                                    studio_matches += 1
                except:
                    pass
            if studio_matches > 0:
                score += studio_matches * 2.0

            # ── Celebrity Subscription Boost: 40% extra for subscribed creators ──
            if subscribed_directors or subscribed_cast:
                has_subscribed_creator = False
                if subscribed_directors and isinstance(m_directors, list):
                    if any(d in subscribed_directors for d in m_directors):
                        has_subscribed_creator = True
                elif subscribed_directors and isinstance(m_directors, str):
                    if m_directors in subscribed_directors:
                        has_subscribed_creator = True
                if subscribed_cast and isinstance(m_cast, list):
                    if any(c in subscribed_cast for c in m_cast):
                        has_subscribed_creator = True
                if has_subscribed_creator:
                    score = score * 1.40  # 40% boost for subscribed creators

        # 3. Trending/Popularity (Medium Priority)
        m2_row = movies2_df[movies2_df["title"] == title]
        if not m2_row.empty:
            pop = float(m2_row.iloc[0].get("popularity", 0.0))
            vote = float(m2_row.iloc[0].get("vote_average", 0.0))
            score += (vote / 10.0) * 0.5
            score += min(pop / 100.0, 1.0) * 0.5

        # 4. Random Discovery (Lowest Priority)
        score += random.uniform(0, 0.1)

        scored_movies.append((title, score))

    scored_movies.sort(key=lambda x: x[1], reverse=True)

    # Save the scores in user interaction database storage
    interactions = user_data.setdefault("interactions", {})
    for title, score in scored_movies[: limit * 3]:
        entry = interactions.setdefault(
            title,
            {
                "watched": False,
                "wishlist": False,
                "watch_timestamp": 0.0,
                "recommendation_score": 0.0,
            },
        )
        entry["recommendation_score"] = float(round(score, 4))

    user_auth.save_users(users)

    # Format and return details
    results = []
    for title, score in scored_movies[:limit]:
        poster, rating, year = fetch_poster(title)
        item = {
            "title": title,
            "poster": poster,
            "rating": rating,
            "year": year,
            "recommendation_score": score,
        }
        _inject_novaflix_rating(title, item)
        results.append(item)
    return results


# ── Dynamic Recommendation Collections ───────────────────────────────────────


def _omdb_search_franchise(query: str, page: int, watched_set: set) -> list:
    results = []
    try:
        url = f"http://www.omdbapi.com/?s={requests.utils.quote(query)}&type=movie&page={page}&apikey={OMDB_KEYS[0]}"
        data = requests.get(url, timeout=5).json()
        if data.get("Response") == "True":
            for item in data.get("Search", []):
                title = item.get("Title")
                if title and title not in watched_set:
                    poster = item.get("Poster")
                    if poster == "N/A" or not poster:
                        poster = FALLBACK_POSTER
                    results.append(
                        {
                            "title": title,
                            "poster": poster,
                            "rating": "N/A",  # OMDB search doesn't return rating usually
                            "year": item.get("Year", "N/A"),
                        }
                    )
    except Exception:
        pass
    return results


def get_collection_page(col_type: str, query: str, page: int, username: str) -> list:
    from processing import auth as user_auth

    users = user_auth.load_users()
    user_data = users.get(username, {})
    watched_set = set(user_data.get("watched_list", []))

    movies_df = load_movies_df()
    movies2_df = load_movies2_df()
    new_df = load_new_df()

    results = []

    if col_type == "franchise":
        # Search OMDB
        return _omdb_search_franchise(query, page, watched_set)

    elif col_type == "director":
        df = movies_df[
            movies_df["director"].apply(
                lambda d: any(query.lower() in str(x).lower() for x in d) if isinstance(d, list)
                else (query.lower() in str(d).lower() if pd.notna(d) else False)
            )
        ]

    elif col_type == "cast":
        df = movies_df[
            movies_df["top_cast"].apply(
                lambda c: any(query.lower() in str(x).lower() for x in c) if isinstance(c, list) else False
            )
        ]
    elif col_type == "genre":
        df = movies_df[
            movies_df["genres"].apply(
                lambda g: any(query.lower() in str(x).lower() for x in g) if isinstance(g, list) else False
            )
        ]

    elif col_type == "similar":
        # Pagination for similar movies by slicing get_recommendations
        recs = recommend(query, "similarity_tags_tags.pkl", n=page * 15)
        # Filter watched
        unwatched_recs = [r for r in recs if r["title"] not in watched_set]
        return unwatched_recs[(page - 1) * 15 : page * 15]

    elif col_type == "trending":
        trending = get_trending_movies("daily", limit=page * 15)
        unwatched = [t for t in trending if t["title"] not in watched_set]
        return unwatched[(page - 1) * 15 : page * 15]

    else:
        return []

    if col_type in ["director", "cast", "genre"]:
        df = df[~df["title"].isin(watched_set)].copy()
        # Sort by popularity if available
        pop_map = dict(zip(movies2_df["title"], movies2_df["popularity"]))
        df["pop"] = df["title"].map(pop_map).fillna(0).astype(float)
        df = df.sort_values("pop", ascending=False)

        df_titles = df["title"].tolist()
        # Get page
        start = (page - 1) * 15
        end = start + 15
        page_titles = df_titles[start:end]

        from concurrent.futures import ThreadPoolExecutor

        def fetch_wrapper(title):
            poster, rating, year = fetch_poster(title)
            return {"title": title, "poster": poster, "rating": rating, "year": year}

        with ThreadPoolExecutor(max_workers=15) as executor:
            results = list(executor.map(fetch_wrapper, page_titles))

    return results


def generate_collections(username: str) -> list:
    from processing import activity_store
    from processing import auth as user_auth

    users = user_auth.load_users()
    user_data = users.get(username, {})

    watched_list = user_data.get("watched_list", [])
    watched_set = set(watched_list)
    wishlist = user_data.get("wishlist", [])

    # Get all-time activities to check user preferences
    stats = activity_store.get_stats(username)
    rec_profile = stats.get("rec_profile", {})
    fav_genres = rec_profile.get("genres_frequently_watched", [])
    fav_directors = rec_profile.get("favorite_directors", [])
    fav_actors = rec_profile.get("favorite_actors", [])

    collections = []
    seen_collections = set()

    movies_df = load_movies_df()
    movies2_df = load_movies2_df()

    # Count Nolan, Sea, Sci-Fi interactions
    nolan_count = 0
    sea_count = 0
    scifi_count = 0

    sea_keywords = [
        "pirate",
        "sea",
        "ocean",
        "ship",
        "sail",
        "island",
        "navy",
        "caribbean",
        "water",
        "marine",
    ]

    for title in watched_list + wishlist:
        m_row = movies_df[movies_df["title"] == title]
        if not m_row.empty:
            row = m_row.iloc[0]
            # Nolan check
            directors = row.get("director", [])
            if isinstance(directors, list):
                if any("Christopher Nolan" in d for d in directors):
                    nolan_count += 1
            elif isinstance(directors, str) and "Christopher Nolan" in directors:
                nolan_count += 1

            # Sci-Fi check
            if "Sci-Fi" in row.get("genres", []):
                scifi_count += 1

            # Sea check: search title or plot
            title_lower = title.lower()
            m2_row = movies2_df[movies2_df["title"] == title]
            plot_lower = ""
            if not m2_row.empty:
                plot_lower = str(m2_row.iloc[0].get("overview", "")).lower()
            if any(w in title_lower or w in plot_lower for w in sea_keywords):
                sea_count += 1

    # 1. Christopher Nolan Collection (if >= 2 Nolan movies or "Christopher Nolan" is in favorite directors)
    is_nolan_fan = nolan_count >= 2 or "Christopher Nolan" in fav_directors
    if is_nolan_fan:
        nolan_movies = get_collection_page("director", "Christopher Nolan", 1, username)
        if nolan_movies:
            collections.append(
                {
                    "id": "director_nolan",
                    "title": "Christopher Nolan Collection",
                    "type": "director",
                    "query": "Christopher Nolan",
                    "movies": nolan_movies[:15],
                }
            )
            seen_collections.add("director_nolan")

    # 2. Sea Adventures Collection (if >= 2 sea/pirate movies or "pirates" is in user search/activity)
    is_sea_fan = sea_count >= 2
    if is_sea_fan:
        # Fetch sea adventure movies from database
        sea_adventure_titles = []
        for idx, row in movies_df.iterrows():
            title = row["title"]
            if title in watched_set:
                continue
            title_lower = title.lower()
            m2_row = movies2_df[movies2_df["title"] == title]
            plot_lower = ""
            if not m2_row.empty:
                plot_lower = str(m2_row.iloc[0].get("overview", "")).lower()
            if any(w in title_lower or w in plot_lower for w in sea_keywords):
                # get popularity
                pop = (
                    float(m2_row.iloc[0].get("popularity", 0.0))
                    if not m2_row.empty
                    else 0.0
                )
                sea_adventure_titles.append((title, pop))

        sea_adventure_titles.sort(key=lambda x: x[1], reverse=True)

        # Build collection movies
        from concurrent.futures import ThreadPoolExecutor

        def fetch_wrapper(t_pop):
            title, _ = t_pop
            poster, rating, year = fetch_poster(title)
            return {"title": title, "poster": poster, "rating": rating, "year": year}

        with ThreadPoolExecutor(max_workers=15) as executor:
            sea_movies = list(executor.map(fetch_wrapper, sea_adventure_titles[:15]))

        if sea_movies:
            collections.append(
                {
                    "id": "theme_sea",
                    "title": "Sea Adventures Collection",
                    "type": "theme",
                    "query": "sea",
                    "movies": sea_movies,
                }
            )
            seen_collections.add("theme_sea")

    # 3. Dynamic Franchise Collections
    # Check if user has watched/wishlisted franchise movies and suggest complete franchise
    franchises = [
        ("Harry Potter", ["Harry Potter"]),
        ("Star Wars", ["Star Wars"]),
        ("Lord of the Rings", ["Lord of the Rings", "The Hobbit"]),
        ("The Dark Knight", ["Batman", "The Dark Knight"]),
        ("Avengers", ["Avengers", "Iron Man", "Thor", "Captain America", "Spider-Man"]),
        ("Pirates of the Caribbean", ["Pirates of the Caribbean"]),
        ("Fast & Furious", ["Fast & Furious", "Fast and Furious"]),
        ("Matrix", ["The Matrix"]),
    ]

    from concurrent.futures import ThreadPoolExecutor

    def fetch_wrapper(title):
        poster, rating, year = fetch_poster(title)
        return {"title": title, "poster": poster, "rating": rating, "year": year}

    for title in watched_list + wishlist:
        for f_name, f_keys in franchises:
            if any(k.lower() in title.lower() for k in f_keys):
                col_id = f"franchise_{f_name}"
                if col_id not in seen_collections:
                    # search OMDB or local database for this franchise
                    f_movies = _omdb_search_franchise(f_name, 1, watched_set)
                    # Fallback to keyword search in local DB if empty
                    if len(f_movies) < 2:
                        local_f_titles = []
                        for idx, row in movies_df.iterrows():
                            t = row["title"]
                            if t in watched_set:
                                continue
                            if any(k.lower() in t.lower() for k in f_keys):
                                m2_row = movies2_df[movies2_df["title"] == t]
                                pop = (
                                    float(m2_row.iloc[0].get("popularity", 0.0))
                                    if not m2_row.empty
                                    else 0.0
                                )
                                local_f_titles.append((t, pop))
                        local_f_titles.sort(key=lambda x: x[1], reverse=True)
                        with ThreadPoolExecutor(max_workers=15) as executor:
                            f_movies = list(
                                executor.map(
                                    lambda x: fetch_wrapper(x[0]), local_f_titles[:15]
                                )
                            )

                    if len(f_movies) >= 2:
                        collections.append(
                            {
                                "id": col_id,
                                "title": f"Complete {f_name} Collection",
                                "type": "franchise",
                                "query": f_name,
                                "movies": f_movies,
                            }
                        )
                        seen_collections.add(col_id)
                        break  # Limit to one franchise collection to avoid clutter

    # 4. Sci-Fi Adventures (if Sci-Fi is in their top genres or scifi_count >= 2)
    is_scifi_fan = scifi_count >= 2 or "Sci-Fi" in fav_genres[:2]
    if is_scifi_fan and "genre_Sci-Fi" not in seen_collections:
        scifi_movies = get_collection_page("genre", "Sci-Fi", 1, username)
        if scifi_movies:
            collections.append(
                {
                    "id": "genre_Sci-Fi",
                    "title": "Sci-Fi & Space Adventures",
                    "type": "genre",
                    "query": "Sci-Fi",
                    "movies": scifi_movies[:15],
                }
            )
            seen_collections.add("genre_Sci-Fi")

    # 5. Director (if user has a favorite director from activities other than Nolan)
    for d_name in fav_directors:
        if d_name != "Christopher Nolan":
            col_id = f"director_{d_name}"
            if col_id not in seen_collections:
                d_movies = get_collection_page("director", d_name, 1, username)
                if len(d_movies) >= 3:
                    collections.append(
                        {
                            "id": col_id,
                            "title": f"More from {d_name}",
                            "type": "director",
                            "query": d_name,
                            "movies": d_movies[:15],
                        }
                    )
                    seen_collections.add(col_id)
                    break  # One custom director collection is enough

    # 6. Cast / Actor (based on favorite actor)
    for actor in fav_actors:
        col_id = f"cast_{actor}"
        if col_id not in seen_collections:
            a_movies = get_collection_page("cast", actor, 1, username)
            if len(a_movies) >= 3:
                collections.append(
                    {
                        "id": col_id,
                        "title": f"Best of {actor}",
                        "type": "cast",
                        "query": actor,
                        "movies": a_movies[:15],
                    }
                )
                seen_collections.add(col_id)
                break

    # 5. Similar Movies
    if watched_list:
        sim_title = watched_list[0]
        s_movies = get_collection_page("similar", sim_title, 1, username)
        if s_movies:
            collections.append(
                {
                    "id": f"similar_{sim_title}",
                    "title": f"Because you watched {sim_title}",
                    "type": "similar",
                    "query": sim_title,
                    "movies": s_movies[:15],
                }
            )

    # 6. Trending Recommended
    t_movies = get_collection_page("trending", "daily", 1, username)
    if t_movies:
        collections.append(
            {
                "id": "trending_daily",
                "title": "Trending Recommended",
                "type": "trending",
                "query": "daily",
                "movies": t_movies[:15],
            }
        )

    # 7. Recommended Anime
    anime_df = load_anime_df()
    if not anime_df.empty:
        a_titles = anime_df["title"].tolist()
        import random

        # randomize slightly so it feels fresh
        random.seed(len(watched_list))
        random.shuffle(a_titles)
        a_titles = a_titles[:15]
        with ThreadPoolExecutor(max_workers=15) as executor:

            def fetch_a(t):
                p, r, y = fetch_anime_poster(t)
                return {"title": t, "poster": p, "rating": r, "year": y}

            a_movies = list(executor.map(fetch_a, a_titles))
        collections.append(
            {
                "id": "recommended_anime",
                "title": "Recommended Anime",
                "type": "similar",
                "query": "Anime",
                "movies": a_movies,
            }
        )

    # 8. Recommended TV Series
    series_df = load_series_df()
    if not series_df.empty:
        s_titles = series_df["title"].tolist()
        import random

        random.seed(len(watched_list) + 1)
        random.shuffle(s_titles)
        s_titles = s_titles[:15]
        with ThreadPoolExecutor(max_workers=15) as executor:

            def fetch_s(t):
                p, r, y = fetch_series_poster(t)
                return {"title": t, "poster": p, "rating": r, "year": y}

            s_movies = list(executor.map(fetch_s, s_titles))
        collections.append(
            {
                "id": "recommended_series",
                "title": "Recommended TV Series",
                "type": "similar",
                "query": "Series",
                "movies": s_movies,
            }
        )

    return collections


# -- Series Episodes ----------------------------------------------------------


_tv_title_to_id: dict = {}

def _fetch_tmdb_episodes(title: str, season: int) -> list:
    """Fetch episode list from TMDB TV Season details endpoint."""
    global _tv_title_to_id
    try:
        api_key = "15d2ea6d0dc1d476efbca3eba2b9bbfb"
        key = title.strip().lower()
        tv_id = _tv_title_to_id.get(key)
        
        if not tv_id:
            # Search for the TV show
            search_url = (
                f"https://api.tmdb.org/3/search/tv"
                f"?api_key={api_key}&query={requests.utils.quote(title)}&language=en-US&page=1"
            )
            data = requests.get(search_url, timeout=6).json()
            results = data.get("results", [])
            if not results:
                return []
                
            # Match title
            target_clean = clean_for_compare(title)
            best_item = None
            for item in results:
                item_name = item.get("name") or item.get("original_name") or ""
                if clean_for_compare(item_name) == target_clean:
                    best_item = item
                    break
            if not best_item:
                for item in results:
                    item_name = item.get("name") or item.get("original_name") or ""
                    if item_name.lower().strip() == title.lower().strip():
                        best_item = item
                        break
            if not best_item:
                best_item = results[0]
                
            tv_id = best_item["id"]
            _tv_title_to_id[key] = tv_id
            
        # Get Season Details
        season_url = f"https://api.tmdb.org/3/tv/{tv_id}/season/{season}?api_key={api_key}&language=en-US"
        season_data = requests.get(season_url, timeout=6).json()
        
        episodes_list = season_data.get("episodes", [])
        if episodes_list:
            episodes = []
            for ep in episodes_list:
                episodes.append({
                    "episode_number": ep.get("episode_number", 1),
                    "name": ep.get("name") or f"Episode {ep.get('episode_number', 1)}",
                    "air_date": ep.get("air_date") or "N/A",
                    "overview": ep.get("overview") or "No description available.",
                    "rating": str(round(ep.get("vote_average", 0), 1)) if ep.get("vote_average") else "N/A"
                })
            return episodes
    except Exception:
        pass
    return []


def get_series_episodes(title: str, season: int = 1) -> list:
    """Get episodes for a specific series season.
    Returns a list of episode objects with episode_number, name, air_date, overview."""
    # 1. Try TMDB
    episodes = _fetch_tmdb_episodes(title, season)
    if episodes:
        return episodes
        
    # 2. Fallback to OMDB
    try:
        for key in OMDB_KEYS:
            try:
                url = f"http://www.omdbapi.com/?t={requests.utils.quote(title)}&Season={season}&apikey={key}"
                data = requests.get(url, timeout=5).json()

                if data.get("Response") == "True" and "Episodes" in data:
                    episodes = []
                    for ep in data["Episodes"]:
                        episodes.append(
                            {
                                "episode_number": int(ep.get("Episode", 1)),
                                "name": ep.get(
                                    "Title", f"Episode {ep.get('Episode', 1)}"
                                ),
                                "air_date": ep.get("Released", "N/A"),
                                "overview": ep.get("Plot", "No description available."),
                                "rating": ep.get("imdbRating", "N/A"),
                            }
                        )
                    return episodes
            except Exception:
                continue
    except Exception:
        pass

    return []


def get_anime_episodes(title: str, season: int = 1) -> list:
    """Get episodes for a specific anime season.
    Returns a list of episode objects with episode_number, name, air_date, overview."""
    # 1. Try TMDB
    episodes = _fetch_tmdb_episodes(title, season)
    if episodes:
        return episodes
        
    # 2. Fallback to OMDB
    try:
        for key in OMDB_KEYS:
            try:
                url = f"http://www.omdbapi.com/?t={requests.utils.quote(title)}&Season={season}&apikey={key}"
                data = requests.get(url, timeout=5).json()

                if data.get("Response") == "True" and "Episodes" in data:
                    episodes = []
                    for ep in data["Episodes"]:
                        episodes.append(
                            {
                                "episode_number": int(ep.get("Episode", 1)),
                                "name": ep.get(
                                    "Title", f"Episode {ep.get('Episode', 1)}"
                                ),
                                "air_date": ep.get("Released", "N/A"),
                                "overview": ep.get("Plot", "No description available."),
                                "rating": ep.get("imdbRating", "N/A"),
                            }
                        )
                    return episodes
            except Exception:
                continue
    except Exception:
        pass

    return []
