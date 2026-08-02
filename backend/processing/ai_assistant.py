import re
import pandas as pd
from processing import preprocess
from processing import auth as user_auth
import os
import json

# Mood definitions mapped to genres and plot keywords
MOOD_MAPPINGS = {
    "Happy": {
        "genres": ["Comedy", "Family", "Romance", "Musical", "Animation"],
        "keywords": ["fun", "laugh", "happy", "humor", "smile", "cheer", "heartwarming", "feel-good"]
    },
    "Emotional": {
        "genres": ["Drama", "Romance", "Biography", "History"],
        "keywords": ["sad", "tear", "emotional", "cry", "touching", "heartbreaking", "love", "loss", "family"]
    },
    "Mind-Blowing": {
        "genres": ["Sci-Fi", "Mystery", "Thriller", "Fantasy"],
        "keywords": ["mind", "space", "dimension", "time", "dream", "twist", "psychological", "conspiracy", "quantum"]
    },
    "Horror": {
        "genres": ["Horror", "Thriller", "Mystery"],
        "keywords": ["scary", "ghost", "dark", "death", "blood", "killer", "spirit", "fear", "creepy", "nightmare"]
    },
    "Action": {
        "genres": ["Action", "Adventure", "Thriller", "Sci-Fi"],
        "keywords": ["fight", "explosion", "chase", "gun", "war", "battle", "superhero", "rescue", "agent", "crime"]
    },
    "Romantic": {
        "genres": ["Romance", "Drama", "Comedy"],
        "keywords": ["love", "relationship", "date", "romantic", "boyfriend", "girlfriend", "marriage", "couple"]
    }
}

def clean_text(text):
    if not text:
        return ""
    return re.sub(r'[^a-zA-Z0-9\s]', '', str(text).lower())

def get_movies_dataset():
    """Load cached movies metadata with details combined."""
    df = preprocess.load_movies_df()
    if df is None:
        return []
    return df

def get_mood_recommendations(username: str, mood: str, limit: int = 20, offset: int = 0):
    """
    Recommend movies based on a selected mood.
    Ensures that already watched movies are excluded.
    Prioritizes user watch history, favorite genres, actors, and directors using AI personalization.
    """
    # Load user's watched list and preferences
    all_users = user_auth.load_users()
    user_data = all_users.get(username, {})
    watched_list = set(user_data.get("watched_list", []))
    favorites = set(user_data.get("favorite_list", []))
    preferences = user_data.get("preferences", {}) or {}

    df = get_movies_dataset()
    if df is None or len(df) == 0:
        return []

    mood_config = MOOD_MAPPINGS.get(mood)
    if not mood_config:
        return []

    genres_target = set([g.lower() for g in mood_config["genres"]])
    keywords_target = mood_config["keywords"]

    # Profile user watch history
    watched_genres = {}
    watched_directors = {}
    watched_actors = {}
    
    for _, row in df.iterrows():
        title = row.get("title")
        if title in watched_list:
            # Accumulate genres
            row_genres = row.get("genres", [])
            if not isinstance(row_genres, list):
                row_genres = [g.strip() for g in str(row_genres).split(",") if g.strip()]
            for g in row_genres:
                g_low = g.lower()
                watched_genres[g_low] = watched_genres.get(g_low, 0) + 1
            
            # Accumulate directors
            row_dirs = row.get("director", [])
            if not isinstance(row_dirs, list):
                if str(row_dirs).startswith("["):
                    try:
                        row_dirs = json.loads(str(row_dirs).replace("'", "\""))
                    except Exception:
                        row_dirs = [d.strip() for d in str(row_dirs).split(",") if d.strip()]
                else:
                    row_dirs = [d.strip() for d in str(row_dirs).split(",") if d.strip()]
            for d in row_dirs:
                d_low = d.lower()
                watched_directors[d_low] = watched_directors.get(d_low, 0) + 1
                
            # Accumulate top cast actors
            row_acts = row.get("top_cast", [])
            if not isinstance(row_acts, list):
                if str(row_acts).startswith("["):
                    try:
                        row_acts = json.loads(str(row_acts).replace("'", "\""))
                    except Exception:
                        row_acts = [a.strip() for a in str(row_acts).split(",") if a.strip()]
                else:
                    row_acts = [a.strip() for a in str(row_acts).split(",") if a.strip()]
            for a in row_acts:
                a_low = a.lower()
                watched_actors[a_low] = watched_actors.get(a_low, 0) + 1

    recommendations = []
    seen_titles = set()
    
    for _, row in df.iterrows():
        title = row.get("title")
        if not title or title in watched_list or title in seen_titles:
            continue

        # Parse movie genres
        row_genres = row.get("genres", [])
        if isinstance(row_genres, list):
            row_genres_list = row_genres
        else:
            row_genres_list = [g.strip() for g in str(row_genres).split(",") if g.strip()]
        row_genres_set = set([g.lower() for g in row_genres_list])
        
        # Calculate a relevance score
        # 1. Base Mood Fit: Genre match & Plot keyword match
        common_mood_genres = genres_target.intersection(row_genres_set)
        
        # Fetch from in-memory cache ONLY to avoid blocking network calls in a loop!
        details = preprocess._details_cache.get(title, {})
        plot = (details.get("plot") or "").lower()
        keyword_matches = sum(2 for kw in keywords_target if kw in plot)
        
        mood_score = len(common_mood_genres) * 5 + keyword_matches
        if mood_score == 0:
            continue
            
        score = mood_score

        # 2. Prioritize explicit favorite genres from settings
        pref_genres = set([g.lower() for g in preferences.get("genres", []) if g])
        common_pref_genres = pref_genres.intersection(row_genres_set)
        score += len(common_pref_genres) * 4

        # 3. Prioritize explicit favorite directors from settings
        pref_directors = set([d.lower() for d in preferences.get("directors", []) if d])
        row_directors = row.get("director", [])
        if not isinstance(row_directors, list):
            if str(row_directors).startswith("["):
                try:
                    row_directors = json.loads(str(row_directors).replace("'", "\""))
                except Exception:
                    row_directors = [d.strip() for d in str(row_directors).split(",") if d.strip()]
            else:
                row_directors = [d.strip() for d in str(row_directors).split(",") if d.strip()]
        row_directors_set = set([d.lower() for d in row_directors])
        common_pref_directors = pref_directors.intersection(row_directors_set)
        score += len(common_pref_directors) * 8

        # 4. Prioritize explicit favorite actors from settings
        pref_actors = set([a.lower() for a in preferences.get("actors", []) if a])
        row_actors = row.get("top_cast", [])
        if not isinstance(row_actors, list):
            if str(row_actors).startswith("["):
                try:
                    row_actors = json.loads(str(row_actors).replace("'", "\""))
                except Exception:
                    row_actors = [a.strip() for a in str(row_actors).split(",") if a.strip()]
            else:
                row_actors = [a.strip() for a in str(row_actors).split(",") if a.strip()]
        row_actors_set = set([a.lower() for a in row_actors])
        common_pref_actors = pref_actors.intersection(row_actors_set)
        score += len(common_pref_actors) * 5

        # 5. Prioritize user watch history similarity
        for g in row_genres_set:
            score += watched_genres.get(g, 0) * 1.5
        for d in row_directors_set:
            score += watched_directors.get(d, 0) * 3.0
        for a in row_actors_set:
            score += watched_actors.get(a, 0) * 1.0

        # 6. Ratings and general AI personalization
        imdb_rating = 0.0
        try:
            rating_str = details.get("rating") or str(row.get("rating", "0"))
            if rating_str and rating_str != "N/A":
                imdb_rating = float(rating_str)
        except ValueError:
            pass

        # Dynamically inject/calculate Novaflix rating without network requests
        nova_rating = 0.0
        temp_dict = {}
        try:
            preprocess._inject_novaflix_rating(title, temp_dict)
            m_avg = temp_dict.get("novaflix_rating", "N/A")
            if m_avg and m_avg != "N/A":
                nova_rating = float(m_avg)
        except Exception:
            pass

        score += imdb_rating * 1.0 + nova_rating * 1.2
        if title in favorites:
            score += 15.0 # boost favorites

        seen_titles.add(title)

        recommendations.append({
            "title": title,
            "score": score,
            "poster": details.get("poster") or row.get("poster") or "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg",
            "year": details.get("year") or row.get("year") or "N/A",
            "rating": details.get("rating") or str(row.get("rating", "N/A")),
            "novaflix_rating": temp_dict.get("novaflix_rating") or details.get("novaflix_rating") or "N/A",
            "genre": details.get("genre") or (", ".join(row_genres_list) if row_genres_list else "N/A")
        })

    # Sort by final_score descending
    recommendations.sort(key=lambda x: x["score"], reverse=True)
    return recommendations[offset : offset + limit]


def answer_ai_query(username: str, query: str):
    """
    Offline semantic query parsing for Nova AI assistant.
    Supports similarity matches (e.g., "like Interstellar"), genre matches, and modifiers (e.g., "less emotional").
    """
    clean_q = clean_text(query)
    
    all_users = user_auth.load_users()
    user_data = all_users.get(username, {})
    watched_list = set(user_data.get("watched_list", []))

    df = get_movies_dataset()
    all_titles = preprocess.get_all_titles()

    # 1. Detect if user is asking for similarity to a specific movie
    target_movie = None
    for title in all_titles:
        clean_title = clean_text(title)
        if clean_title in clean_q and len(clean_title) > 3:
            # Match
            target_movie = title
            break

    # If asking for similar but modifier
    results = []
    
    # Check if similarity matched
    if target_movie:
        # Get recommendations
        try:
            recs = preprocess.recommend(target_movie, "similarity.pkl", n=50)
            for r in recs:
                if r not in watched_list:
                    details = preprocess.get_movie_details(r)
                    results.append({
                        "title": r,
                        "poster": details.get("poster"),
                        "rating": details.get("rating"),
                        "novaflix_rating": details.get("novaflix_rating", "N/A"),
                        "genre": details.get("genre"),
                        "year": details.get("year")
                    })
        except Exception:
            pass

    # If no similarity match or we want to filter with keywords
    # Parse query for genres, directors, adjectives
    # Common genres check
    genre_keywords = {
        "scifi": ["sci-fi", "science fiction", "space", "alien", "galaxy", "futuristic", "time travel"],
        "action": ["action", "fight", "explosion", "battle", "gun", "superhero"],
        "comedy": ["comedy", "funny", "laugh", "hilarious", "humor"],
        "drama": ["drama", "emotional", "touching", "sad", "biography"],
        "horror": ["horror", "scary", "ghost", "creepy", "spooky"],
        "romance": ["romance", "romantic", "love", "couple"],
        "thriller": ["thriller", "mystery", "suspense", "crime"]
    }

    matched_genres = []
    for g, keywords in genre_keywords.items():
        for kw in keywords:
            if kw in clean_q:
                matched_genres.append(g)
                break

    # Check modifiers
    less_emotional = "less emotional" in clean_q or "not sad" in clean_q or "happy" in clean_q
    more_action = "more action" in clean_q or "fast paced" in clean_q or "exciting" in clean_q

    # Rank all movies based on metadata matches
    backup_results = []
    for _, row in df.iterrows():
        title = row.get("title")
        if title in watched_list:
            continue
        
        # Don't repeat if already in similarity results
        if any(r["title"] == title for r in results):
            continue

        score = 0
        details = preprocess.get_movie_details(title)
        genres_str = (details.get("genre") or "").lower()
        plot_str = (details.get("plot") or "").lower()

        # Genre hits
        for g in matched_genres:
            if g == "scifi" and ("sci-fi" in genres_str or "science fiction" in genres_str):
                score += 10
            elif g in genres_str:
                score += 8

        # Modifier hits
        if less_emotional:
            if "drama" in genres_str:
                score -= 5
            if "comedy" in genres_str or "action" in genres_str:
                score += 3
        if more_action:
            if "action" in genres_str or "adventure" in genres_str:
                score += 5

        # Check raw query keywords matching plot
        words = clean_q.split()
        for w in words:
            if len(w) > 3 and w in plot_str:
                score += 1

        if score > 0:
            backup_results.append({
                "title": title,
                "score": score,
                "poster": details.get("poster"),
                "rating": details.get("rating"),
                "novaflix_rating": details.get("novaflix_rating", "N/A"),
                "genre": details.get("genre"),
                "year": details.get("year")
            })

    # Combine similarity results and keyword results
    backup_results.sort(key=lambda x: x["score"], reverse=True)
    combined = results + backup_results
    
    # Deduplicate
    seen_titles = set()
    final_list = []
    for item in combined:
        if item["title"] not in seen_titles:
            seen_titles.add(item["title"])
            final_list.append(item)

    # Return top 5 suggestions
    return final_list[:6]
