import json
import os
import time
import uuid
import datetime

try:
    from core.config import get_settings
    _base = os.path.dirname(get_settings().USERS_FILE)
except Exception:
    _base = os.path.join(os.path.dirname(__file__), '..', 'Files')

ACTIVITY_DB = os.path.join(_base, 'activity.json')

def load_activities():
    if not os.path.exists(ACTIVITY_DB):
        return {}
    with open(ACTIVITY_DB, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_activities(data):
    os.makedirs(os.path.dirname(ACTIVITY_DB), exist_ok=True)
    with open(ACTIVITY_DB, 'w') as f:
        json.dump(data, f, indent=2)

def log_activity(username: str, action_type: str, movie_title: str = None, 
                 movie_poster: str = None, rating: float = None, 
                 other_user: str = None, metadata: dict = None):
    """
    action_type can be:
    - 'watched', 'wishlist_add', 'wishlist_remove', 'favorite_add', 'favorite_remove'
    - 'search', 'share', 'rate', 'review', 'watch_duration', 'watch_completion'
    - 'follow', 'unfollow', 'follower_gained', 'follower_lost', 'like', 'comment'
    - 'message_send', 'profile_view', 'collection_share', 'friend_interaction', 'list_create'
    """
    data = load_activities()
    user_log = data.setdefault(username, [])
    
    event = {
        'id': str(uuid.uuid4()),
        'type': action_type,
        'timestamp': int(time.time() * 1000),
        'movie_title': movie_title,
        'movie_poster': movie_poster,
        'rating': rating,
        'other_user': other_user,
        'metadata': metadata or {}
    }
    
    user_log.insert(0, event)
    
    # Cap at 1000 events per user to keep it fast
    data[username] = user_log[:1000]
    
    save_activities(data)
    return event

def get_timeline(username: str, limit: int = 50):
    data = load_activities()
    return data.get(username, [])[:limit]

def get_stats(username: str):
    data = load_activities()
    events = data.get(username, [])
    
    # Import locally to avoid circular import
    from processing import preprocess
    movies_df = preprocess.load_movies_df()
    
    now = int(time.time() * 1000)
    
    # Calculate time boundaries
    # Today midnight
    now_dt = datetime.datetime.now()
    today_midnight = datetime.datetime(now_dt.year, now_dt.month, now_dt.day)
    today_ago = int(today_midnight.timestamp() * 1000)
    
    # Weekly & Monthly
    week_ago = now - (7 * 24 * 60 * 60 * 1000)
    month_ago = now - (30 * 24 * 60 * 60 * 1000)
    
    # Helper to retrieve movie metadata
    def get_movie_meta(title):
        if movies_df is None or title is None:
            return None
        m_row = movies_df[movies_df["title"] == title]
        if not m_row.empty:
            return m_row.iloc[0]
        return None

    # Filtered lists of events
    today_events = [e for e in events if e['timestamp'] >= today_ago]
    week_events = [e for e in events if e['timestamp'] >= week_ago]
    month_events = [e for e in events if e['timestamp'] >= month_ago]

    # --- 1. Today's Activity ---
    today_watched = sum(1 for e in today_events if e['type'] in ('watched', 'watch_completion'))
    today_wishlist = sum(1 for e in today_events if e['type'] == 'wishlist_add')
    today_reviews = sum(1 for e in today_events if e['type'] == 'review')
    today_followers = sum(1 for e in today_events if e['type'] == 'follower_gained')

    # --- 2. Weekly Activity ---
    # Total watch hours (explicit duration + estimated 2h for simple watched events)
    weekly_watch_time = 0.0
    completed_movies_week = 0
    weekly_genres = {}
    
    for e in week_events:
        if e['type'] == 'watch_duration':
            weekly_watch_time += float(e['metadata'].get('duration_min', 0)) / 60.0
        elif e['type'] == 'watched':
            # estimate 2 hours if no duration event exists
            weekly_watch_time += 2.0
            completed_movies_week += 1
        elif e['type'] == 'watch_completion':
            if float(e['metadata'].get('completion_pct', 0)) >= 80:
                completed_movies_week += 1
        
        # Track weekly genres
        if e.get('movie_title') and e['type'] in ('watched', 'wishlist_add', 'favorite_add'):
            meta = get_movie_meta(e['movie_title'])
            if meta is not None:
                genres = meta.get("genres", [])
                for g in genres:
                    weekly_genres[g] = weekly_genres.get(g, 0) + 1

    sorted_weekly_genres = sorted([{"genre": k, "count": v} for k, v in weekly_genres.items()], key=lambda x: x['count'], reverse=True)
    top_categories_week = [x['genre'] for x in sorted_weekly_genres[:4]]

    # --- 3. Monthly Activity & Profile Analysis ---
    monthly_watched = sum(1 for e in month_events if e['type'] in ('watched', 'watch_completion'))
    monthly_genres = {}
    monthly_actors = {}
    monthly_directors = {}
    
    # Points breakdown for Engagement Score
    score_rules = {
        'watched': 10,
        'watch_completion': 10,
        'wishlist_add': 5,
        'favorite_add': 10,
        'review': 15,
        'rate': 5,
        'follow': 10,
        'message_send': 5,
        'search': 1,
        'like': 2,
        'comment': 5,
        'share': 5,
        'profile_view': 2,
        'collection_share': 10
    }
    
    engagement_score = 0
    for e in month_events:
        engagement_score += score_rules.get(e['type'], 2)
        
        if e.get('movie_title') and e['type'] in ('watched', 'wishlist_add', 'favorite_add', 'review', 'rate'):
            meta = get_movie_meta(e['movie_title'])
            if meta is not None:
                # Genres
                for g in meta.get("genres", []):
                    monthly_genres[g] = monthly_genres.get(g, 0) + 1
                # Directors
                dirs = meta.get("director", [])
                if isinstance(dirs, list):
                    for d in dirs:
                        monthly_directors[d] = monthly_directors.get(d, 0) + 1
                elif isinstance(dirs, str) and dirs != "N/A":
                    monthly_directors[dirs] = monthly_directors.get(dirs, 0) + 1
                # Actors
                cast = meta.get("top_cast", [])
                if isinstance(cast, list):
                    for c in cast:
                        monthly_actors[c] = monthly_actors.get(c, 0) + 1

    # Format monthly genres with percentage
    total_monthly_genre_hits = sum(monthly_genres.values()) or 1
    genre_stats_monthly = []
    for k, v in monthly_genres.items():
        genre_stats_monthly.append({
            "name": k,
            "count": v,
            "pct": int(round((v / total_monthly_genre_hits) * 100))
        })
    genre_stats_monthly.sort(key=lambda x: x['count'], reverse=True)
    
    favorite_actors = sorted(monthly_actors.keys(), key=lambda x: monthly_actors[x], reverse=True)[:5]
    favorite_directors = sorted(monthly_directors.keys(), key=lambda x: monthly_directors[x], reverse=True)[:3]

    # --- 4. All Time Stats (backward compatibility) ---
    all_movies_watched = sum(1 for e in events if e['type'] in ('watched', 'watch_completion'))
    all_reviews_written = sum(1 for e in events if e['type'] == 'review')
    all_lists_created = sum(1 for e in events if e['type'] == 'list_create')
    all_watch_time = 0.0
    for e in events:
        if e['type'] == 'watch_duration':
            all_watch_time += float(e['metadata'].get('duration_min', 0)) / 60.0
        elif e['type'] == 'watched':
            all_watch_time += 2.0 # default 2h

    # --- 5. Monthly Stats (backward compatibility) ---
    month_watched_compat = sum(1 for e in month_events if e['type'] in ('watched', 'watch_completion'))
    month_time_compat = 0.0
    for e in month_events:
        if e['type'] == 'watch_duration':
            month_time_compat += float(e['metadata'].get('duration_min', 0)) / 60.0
        elif e['type'] in ('watched', 'watch_completion'):
            month_time_compat += 2.0
    month_reviews = sum(1 for e in month_events if e['type'] == 'review')
    month_lists = sum(1 for e in month_events if e['type'] == 'list_create')
    
    active_days = set()
    for e in month_events:
        day_str = time.strftime('%Y-%m-%d', time.localtime(e['timestamp'] / 1000))
        active_days.add(day_str)

    # --- 6. Recommendation Profile (extracted from all activities) ---
    all_genres = {}
    all_actors = {}
    all_directors = {}
    all_languages = {}
    all_years = {}
    
    for e in events:
        if e.get('movie_title') and e['type'] in ('watched', 'wishlist_add', 'favorite_add', 'review', 'rate'):
            meta = get_movie_meta(e['movie_title'])
            if meta is not None:
                for g in meta.get("genres", []):
                    all_genres[g] = all_genres.get(g, 0) + 1
                dirs = meta.get("director", [])
                if isinstance(dirs, list):
                    for d in dirs:
                        all_directors[d] = all_directors.get(d, 0) + 1
                elif isinstance(dirs, str) and dirs != "N/A":
                    all_directors[dirs] = all_directors.get(dirs, 0) + 1
                cast = meta.get("top_cast", [])
                if isinstance(cast, list):
                    for c in cast:
                        all_actors[c] = all_actors.get(c, 0) + 1
                
                # Fetch detailed year & language from preprocess cache if possible
                title = e['movie_title']
                details = preprocess._details_cache.get(title)
                if details:
                    lang = details.get("language", "N/A")
                    if lang and lang != "N/A":
                        all_languages[lang] = all_languages.get(lang, 0) + 1
                    year = details.get("year", "N/A")
                    if year and year != "N/A":
                        # clean year to first 4 digits
                        y = str(year)[:4]
                        all_years[y] = all_years.get(y, 0) + 1

    rec_profile = {
        "genres_frequently_watched": sorted(all_genres.keys(), key=lambda x: all_genres[x], reverse=True)[:5],
        "favorite_actors": sorted(all_actors.keys(), key=lambda x: all_actors[x], reverse=True)[:5],
        "favorite_directors": sorted(all_directors.keys(), key=lambda x: all_directors[x], reverse=True)[:3],
        "preferred_languages": sorted(all_languages.keys(), key=lambda x: all_languages[x], reverse=True)[:3],
        "preferred_years": sorted(all_years.keys(), key=lambda x: all_years[x], reverse=True)[:3],
    }

    # Calculate Movie DNA details
    dna_genres = []
    total_hits = sum(all_genres.values()) or 1
    for g, val in sorted(all_genres.items(), key=lambda x: x[1], reverse=True)[:5]:
        dna_genres.append({
            "genre": g,
            "pct": int(round((val / total_hits) * 100))
        })
        
    fav_dir = "N/A"
    sorted_dirs = sorted(all_directors.items(), key=lambda x: x[1], reverse=True)
    if sorted_dirs:
        fav_dir = sorted_dirs[0][0]
        
    top_genre = dna_genres[0]["genre"] if dna_genres else "Drama"
    personality_map = {
        "Sci-Fi": "Mind-Bending Explorer 🚀",
        "Action": "Adrenaline Action Hero 💥",
        "Comedy": "Joyful Humour Critic 😂",
        "Horror": "Fearless Nightmare King 😱",
        "Drama": "Deep Emotion Investigator 🎭",
        "Romance": "Romantic Dreamer 💖",
        "Thriller": "Suspense Detective 🕵️"
    }
    personality = personality_map.get(top_genre, "Cinephile Pioneer 🎬")

    movie_dna = {
        "genres": dna_genres,
        "favorite_director": fav_dir,
        "watch_time": int(round(all_watch_time)),
        "personality": personality
    }

    return {
        "today": {
            "watched": today_watched,
            "wishlist_add": today_wishlist,
            "reviews": today_reviews,
            "followers_gained": today_followers
        },
        "weekly": {
            "watch_time": round(weekly_watch_time, 1),
            "completed": completed_movies_week,
            "genres": sorted_weekly_genres,
            "categories": top_categories_week
        },
        "monthly": {
            "watched": monthly_watched,
            "genres": genre_stats_monthly[:5],
            "actors": favorite_actors,
            "directors": favorite_directors,
            "engagement_score": engagement_score
        },
        "all_time": {
            "movies_watched": all_movies_watched,
            "reviews_written": all_reviews_written,
            "lists_created": all_lists_created,
            "watch_time": int(round(all_watch_time))
        },
        "this_month": {
            "movies_watched": month_watched_compat,
            "time_spent": int(round(month_time_compat)),
            "reviews_written": month_reviews,
            "lists_created": month_lists,
            "days_active": len(active_days)
        },
        "rec_profile": rec_profile,
        "movie_dna": movie_dna
    }
