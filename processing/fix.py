import re

with open('c:/Users/altaf/Desktop/Novaflix/backend/processing/preprocess.py', 'r', encoding='utf-8') as f:
    c = f.read()

new_c = re.sub(
    r'def get_latest_movies\(\) -> list:.*?(?=\ndef get_anime_details)',
    r'''def get_latest_movies() -> list:
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
                    results.append({
                        "imdbID": imdb_id,
                        "title": data.get("Title", "Unknown"),
                        "year": data.get("Year", "N/A"),
                        "poster": poster,
                        "rating": data.get("imdbRating", "N/A"),
                        "genre": data.get("Genre", "N/A"),
                    })
                    break
        except Exception:
            continue
    _latest_cache = results
    return results

# ── Anime Details ────────────────────────────────────────────────────────────
''',
    c,
    flags=re.DOTALL
)

with open('c:/Users/altaf/Desktop/Novaflix/backend/processing/preprocess.py', 'w', encoding='utf-8') as f:
    f.write(new_c)

print('Done')
