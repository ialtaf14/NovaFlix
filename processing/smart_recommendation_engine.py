"""
Smart Recommendation Engine Framework
======================================
Unified, metadata & semantic-context recommendation engines for:
- Movies  (SmartMovieRecommendationEngine)
- TV Series (SmartSeriesRecommendationEngine)
- Anime   (SmartAnimeRecommendationEngine)

Categories produced per item:
  1. similar_genre         — Weighted genre overlap (Jaccard + Overlap + TF-IDF context)
  2. same_director_creator — Exact director / creator / studio match
  3. same_cast             — Shared lead actors / actresses
  4. similar_setting       — World-environment detection (alien, space, ocean, school …)
  5. story_similarity      — TF-IDF cosine plot/overview similarity
  6. similar_rating        — Same IMDB/rating band (±0.8 points), highest first

All lists are sorted by relevance score (highest first).
Pre-built indexes ensure sub-second recommendation responses.
"""

import re
import json
import logging
import numpy as np
import pandas as pd
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# ── Environment / Setting Taxonomy ───────────────────────────────────────────
ENVIRONMENT_CLUSTERS = [
    {
        "id": "alien_planet",
        "title": "Set on Other Planets & Alien Worlds",
        "keywords": [
            "alien planet", "extraterrestrial world", "pandora", "distant planet",
            "fictional planet", "exoplanet", "another planet", "different planet",
            "alien world", "space colony", "foreign world", "extraterrestrial planet",
            "colonized planet", "desert planet", "ice planet",
        ],
    },
    {
        "id": "space",
        "title": "Space & Deep Space Adventures",
        "keywords": [
            "space", "deep space", "spacecraft", "spaceship", "orbit", "space station",
            "astronaut", "zero gravity", "interstellar", "cosmos", "cosmic", "galaxy",
            "solar system", "spacewalk", "space travel", "hyperspace", "lightspeed",
        ],
    },
    {
        "id": "ocean",
        "title": "Ocean, Sea & Underwater World Settings",
        "keywords": [
            "ocean", "sea", "underwater", "submarine", "naval", "deep ocean",
            "marine", "waterworld", "shipwreck", "maritime", "scuba", "reef",
            "abyss", "atlantic", "pacific", "sea monster", "underwater world", "sailor",
        ],
    },
    {
        "id": "school_academy",
        "title": "School, Academy & Youth Settings",
        "keywords": [
            "school", "high school", "highschool", "academy", "classroom", "student",
            "campus", "boarding school", "dormitory", "university", "college",
            "teenager", "youth", "school life", "magic academy",
        ],
    },
    {
        "id": "isekai",
        "title": "Isekai & Otherworld Fantasy Settings",
        "keywords": [
            "isekai", "reincarnation", "reincarnated", "summoned", "another world",
            "fantasy world", "transported", "parallel world", "game world",
            "overpowered protagonist", "demon lord",
        ],
    },
    {
        "id": "jungle",
        "title": "Jungle & Forest Environments",
        "keywords": [
            "jungle", "forest", "rainforest", "wilderness", "woods", "amazon",
            "safari", "wildlife", "tropical forest", "canopy", "deep forest",
            "woodland", "jungle expedition",
        ],
    },
    {
        "id": "desert",
        "title": "Desert & Wasteland Settings",
        "keywords": [
            "desert", "sand", "wasteland", "dune", "arid", "sahara", "badlands",
            "outback", "sandstorm", "barren desert", "desert wasteland",
        ],
    },
    {
        "id": "arctic",
        "title": "Arctic & Frozen Wilderness Settings",
        "keywords": [
            "arctic", "antarctica", "snow", "ice", "frozen", "glacier", "blizzard",
            "polar", "tundra", "avalanche", "subzero", "iceberg", "frozen wasteland",
        ],
    },
    {
        "id": "island",
        "title": "Island & Remote Wilderness Settings",
        "keywords": [
            "island", "deserted island", "tropical island", "atoll", "archipelago",
            "shipwrecked", "castaway", "isolated island", "remote island",
        ],
    },
    {
        "id": "dystopian",
        "title": "Dystopian & Cyberpunk World Settings",
        "keywords": [
            "dystopia", "dystopian", "cyberpunk", "futuristic city", "metropolis",
            "megacity", "post-apocalyptic city", "neon city", "totalitarian",
            "surveillance state", "future city", "police state",
        ],
    },
    {
        "id": "crime_mafia",
        "title": "Crime, Mob & Underworld Settings",
        "keywords": [
            "mafia", "gangster", "cartel", "mobster", "organized crime",
            "underworld", "detective", "heist", "drug lord", "cop",
            "police", "criminal syndicate", "yakuza",
        ],
    },
    {
        "id": "post_apocalyptic",
        "title": "Post-Apocalyptic & Ruined Worlds",
        "keywords": [
            "post-apocalyptic", "postapocalyptic", "apocalypse", "fallout", "ruins",
            "apocalyptic", "extinction event", "nuclear winter", "ruined world",
            "survival", "collapse of civilization", "zombie apocalypse",
        ],
    },
    {
        "id": "medieval",
        "title": "Medieval & Kingdom World Settings",
        "keywords": [
            "medieval", "kingdom", "castle", "throne", "feudal", "empire", "realm",
            "knights", "sword and shield", "ancient kingdom", "monarchy", "dynasty",
        ],
    },
    {
        "id": "underground",
        "title": "Underground & Subterranean Environments",
        "keywords": [
            "underground", "subterranean", "cave", "cavern", "bunker", "tunnel",
            "tomb", "mines", "catacombs", "subterranean world",
        ],
    },
    {
        "id": "time_travel",
        "title": "Time Travel & Alternate Realities",
        "keywords": [
            "time travel", "timetravel", "multiverse", "parallel universe", "time loop",
            "alternate reality", "timeline", "wormhole", "temporal", "time machine",
            "dimension", "quantum realm",
        ],
    },
    {
        "id": "supernatural",
        "title": "Supernatural & Haunted World Settings",
        "keywords": [
            "haunted", "ghost", "supernatural", "demon", "possession", "paranormal",
            "witch", "curse", "spirit realm", "demonic", "occult", "haunted house",
        ],
    },
]

# Keyword clusters to detect "superhero" style — used to avoid cross-contamination
_SUPERHERO_KWS: Set[str] = {
    "superhero", "comic book", "marvel comics", "dc comics",
    "batman", "superman", "spiderman", "spider-man", "x-men",
    "avengers", "iron man", "captain america", "mutant",
}


# ── Utility Helpers ──────────────────────────────────────────────────────────
def _normalize_text(text: Any) -> str:
    if text is None or (isinstance(text, float) and np.isnan(text)):
        return ""
    return re.sub(r"\s+", " ", str(text).lower().strip())


def _extract_string_list(val: Any) -> List[str]:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return []
    if isinstance(val, list):
        out = []
        for item in val:
            if isinstance(item, str) and item.strip():
                out.append(item.strip())
            elif isinstance(item, dict) and "name" in item:
                out.append(str(item["name"]).strip())
        return out
    if isinstance(val, str):
        s = val.strip()
        if not s:
            return []
        if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
            try:
                parsed = json.loads(s.replace("'", '"'))
                if isinstance(parsed, list):
                    res = []
                    for x in parsed:
                        if isinstance(x, dict) and "name" in x:
                            res.append(str(x["name"]).strip())
                        elif isinstance(x, str) and x.strip():
                            res.append(x.strip())
                    if res:
                        return res
            except Exception:
                pass
        if "," in s:
            return [p.strip() for p in s.split(",") if p.strip()]
        return [s]
    return []


def _normalize_name(name: str) -> str:
    """Strip punctuation, lower-case — for exact person / studio comparison."""
    if not name:
        return ""
    return re.sub(r"[^a-zA-Z0-9]", "", str(name).lower())


# ── Base Engine ──────────────────────────────────────────────────────────────
class SmartBaseRecommendationEngine:
    """
    Unified recommendation engine covering 6 categories:
    genre · director/creator · cast · setting · story · rating
    """

    def __init__(
        self,
        data: Union[pd.DataFrame, List[Dict[str, Any]]],
        media_type: str = "Media",
    ):
        self.media_type = media_type
        if isinstance(data, list):
            self.df = pd.DataFrame(data)
        elif isinstance(data, pd.DataFrame):
            self.df = data.copy()
        else:
            raise ValueError("data must be a pandas DataFrame or list of dicts.")
        if self.df.empty:
            raise ValueError(f"{media_type} DataFrame is empty.")

        self._preprocess_data()
        self._build_tfidf_index()

    # ── Pre-processing ────────────────────────────────────────────────────────
    def _preprocess_data(self) -> None:
        # 1. Title
        for col in ["title", "name", "movie_title", "series_title", "anime_title"]:
            if col in self.df.columns:
                self.df["_canonical_title"] = self.df[col].astype(str).str.strip()
                break
        if "_canonical_title" not in self.df.columns:
            raise ValueError("DataFrame must contain a 'title' or 'name' column.")

        # Fast title → index lookup (case + punctuation insensitive)
        self._title_to_idx: Dict[str, int] = {}
        for idx, t in enumerate(self.df["_canonical_title"]):
            clean = t.lower().strip()
            self._title_to_idx.setdefault(clean, idx)
            alpha = re.sub(r"[^a-zA-Z0-9]", "", clean)
            if alpha:
                self._title_to_idx.setdefault(alpha, idx)

        # 2. Genres
        genres_raw = self.df.get("genres", pd.Series([[]] * len(self.df)))
        self.df["_genres_list"] = [_extract_string_list(g) for g in genres_raw]
        self.df["_genres_set"] = [
            {g.lower().strip() for g in lst} for lst in self.df["_genres_list"]
        ]

        # 3. Director / Creator / Studio
        creator_col = next(
            (c for c in ["director", "creators", "networks", "crew"] if c in self.df.columns),
            None,
        )
        if creator_col:
            creators_extracted = [_extract_string_list(v) for v in self.df[creator_col]]
        else:
            creators_extracted = [[] for _ in range(len(self.df))]

        self.df["_creator_display"] = [", ".join(c) if c else "Unknown" for c in creators_extracted]
        self.df["_creator_normalized_set"] = [
            {_normalize_name(x) for x in c if _normalize_name(x)}
            for c in creators_extracted
        ]

        # 4. Top Cast
        cast_col = next(
            (c for c in ["top_cast", "cast", "actors"] if c in self.df.columns),
            None,
        )
        if cast_col:
            cast_extracted = [_extract_string_list(v) for v in self.df[cast_col]]
        else:
            cast_extracted = [[] for _ in range(len(self.df))]

        self.df["_cast_display_list"] = cast_extracted
        self.df["_cast_normalized_set"] = [
            {_normalize_name(x) for x in c if _normalize_name(x)}
            for c in cast_extracted
        ]

        # 5. Rating (vote_average)
        for rating_col in ["vote_average", "rating", "imdb_rating", "score"]:
            if rating_col in self.df.columns:
                self.df["_rating"] = pd.to_numeric(self.df[rating_col], errors="coerce")
                break
        else:
            self.df["_rating"] = np.nan

        # 6. Combined text for TF-IDF
        text_parts: List[List[str]] = []
        for text_col in ["overview", "description", "plot", "keywords", "tags", "tagline", "genres"]:
            if text_col in self.df.columns:
                col_vals = []
                for val in self.df[text_col]:
                    if isinstance(val, list):
                        col_vals.append(" ".join(str(x) for x in val))
                    else:
                        col_vals.append(str(val) if pd.notna(val) else "")
                text_parts.append(col_vals)

        combined: List[str] = []
        n = len(self.df)
        for i in range(n):
            row_str = " ".join(tp[i] for tp in text_parts)
            combined.append(_normalize_text(row_str))
        self.df["_combined_text"] = combined

    def _build_tfidf_index(self) -> None:
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=12000,
            sublinear_tf=True,
        )
        self.tfidf_matrix = self.vectorizer.fit_transform(
            self.df["_combined_text"].tolist()
        )

    def _resolve_movie_idx(self, title: str) -> Optional[int]:
        if not title:
            return None
        clean = title.lower().strip()
        if clean in self._title_to_idx:
            return self._title_to_idx[clean]
        alpha = re.sub(r"[^a-zA-Z0-9]", "", clean)
        if alpha in self._title_to_idx:
            return self._title_to_idx[alpha]
        # partial match fallback
        for t, idx in self._title_to_idx.items():
            if clean in t or t in clean:
                return idx
        return None

    # ── 1. Similar Genre ──────────────────────────────────────────────────────
    def find_similar_genres(self, selected_item: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """
        Genre overlap scored by:
          score = 0.5 * jaccard + 0.3 * overlap_ratio + 0.2 * tfidf_similarity

        Superhero cross-contamination is damped by 0.4×.
        Only items with score > 0.15 are returned.
        Results sorted by score descending (most matching genres first).
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return []

        src_genres: Set[str] = self.df.at[idx, "_genres_set"]
        if not src_genres:
            return []

        num_src = len(src_genres)
        src_vector = self.tfidf_matrix[idx]
        sim_scores = cosine_similarity(src_vector, self.tfidf_matrix).flatten()

        src_text = self.df.at[idx, "_combined_text"]
        src_is_superhero = any(kw in src_text for kw in _SUPERHERO_KWS)

        results = []
        for i, row_genres in enumerate(self.df["_genres_set"]):
            if i == idx or not row_genres:
                continue

            intersection = src_genres & row_genres
            if not intersection:
                continue

            jaccard = len(intersection) / len(src_genres | row_genres)
            overlap_ratio = len(intersection) / num_src
            tfidf_sim = float(sim_scores[i])

            score = 0.5 * jaccard + 0.3 * overlap_ratio + 0.2 * tfidf_sim

            # Damp superhero cross-genre contamination
            if not src_is_superhero:
                tgt_text = self.df.at[i, "_combined_text"]
                if any(kw in tgt_text for kw in _SUPERHERO_KWS):
                    score *= 0.35

            if score <= 0.15:
                continue

            matched_str = ", ".join(sorted(g.title() for g in intersection))
            pct = int(round(overlap_ratio * 100))
            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": round(float(score), 4),
                "matched_genres": matched_str,
                "genre_overlap_pct": pct,
                "reason": f"{len(intersection)}/{num_src} genres match ({matched_str}) — {pct}% overlap",
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_n]

    # ── 2. Same Director / Creator / Studio ──────────────────────────────────
    def find_same_director_creator(self, selected_item: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """
        Exact normalized director/creator match.
        Scored 1.0 for same creator.
        Additionally boosted by genre overlap to surface most relevant titles first.
        Results sorted by genre_boost (most genre overlap) descending.
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return []

        src_creators: Set[str] = self.df.at[idx, "_creator_normalized_set"]
        if not src_creators:
            return []

        src_genres: Set[str] = self.df.at[idx, "_genres_set"]

        results = []
        for i, row_creators in enumerate(self.df["_creator_normalized_set"]):
            if i == idx or not row_creators:
                continue

            matched = src_creators & row_creators
            if not matched:
                continue

            # Genre overlap as secondary sort signal
            row_genres: Set[str] = self.df.at[i, "_genres_set"]
            genre_overlap = len(src_genres & row_genres) if src_genres and row_genres else 0
            genre_boost = round(genre_overlap / max(len(src_genres), 1), 4)

            creator_display = self.df.at[i, "_creator_display"]
            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": round(1.0 + genre_boost * 0.5, 4),   # 1.0 base + genre bonus
                "director": creator_display,
                "genre_overlap": genre_overlap,
                "reason": f"Same director/creator: {creator_display} (+{genre_overlap} genre(s) in common)",
            })

        # Sort: same director + most genre overlap first
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_n]

    # ── 3. Same Cast ─────────────────────────────────────────────────────────
    def find_same_cast(self, selected_item: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """
        Shared cast members.
        score = min(1.0, shared_count * 0.35)
        Sorted by number of shared cast members (descending).
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return []

        src_cast: Set[str] = self.df.at[idx, "_cast_normalized_set"]
        if not src_cast:
            return []

        results = []
        for i, row_cast in enumerate(self.df["_cast_normalized_set"]):
            if i == idx or not row_cast:
                continue

            overlap = src_cast & row_cast
            if not overlap:
                continue

            display_names = [
                name for name in self.df.at[i, "_cast_display_list"]
                if _normalize_name(name) in overlap
            ]
            cast_str = ", ".join(display_names[:3])
            score = min(1.0, len(overlap) * 0.35)

            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": round(float(score), 4),
                "shared_cast_count": len(overlap),
                "shared_cast": cast_str,
                "reason": f"{len(overlap)} shared cast: {cast_str}",
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_n]

    # ── 4. Similar Setting / Environment ─────────────────────────────────────
    def find_similar_setting(self, selected_item: str, top_n: int = 15) -> Dict[str, Any]:
        """
        Detect world-environment cluster from combined text, then find matching items.
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return {"detected_environment": None, "category_title": None, "movies": [], "items": []}

        src_text = self.df.at[idx, "_combined_text"]
        if not src_text:
            return {"detected_environment": None, "category_title": None, "movies": [], "items": []}

        best_cluster = None
        best_score = 0

        for cluster in ENVIRONMENT_CLUSTERS:
            freq = 0
            for kw in cluster["keywords"]:
                pattern = r"\b" + re.escape(kw) + r"\b"
                n_matches = len(re.findall(pattern, src_text))
                if n_matches:
                    weight = 10 if (" " in kw or len(kw) > 7) else 2
                    freq += n_matches * weight
            if freq > best_score:
                best_score = freq
                best_cluster = cluster

        if not best_cluster or best_score == 0:
            return {"detected_environment": None, "category_title": None, "movies": [], "items": []}

        kws = set(best_cluster["keywords"])
        results = []
        for i, text in enumerate(self.df["_combined_text"]):
            if i == idx or not text:
                continue
            hit_kws = [kw for kw in kws if kw in text]
            if not hit_kws:
                continue
            score = min(1.0, 0.4 + len(hit_kws) * 0.2)
            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": round(float(score), 4),
                "reason": f"Same setting: {best_cluster['title']}",
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        items = results[:top_n]
        return {
            "detected_environment": best_cluster["id"],
            "category_title": best_cluster["title"],
            "movies": items,
            "items": items,
        }

    # ── 5. Story / Plot Similarity ────────────────────────────────────────────
    def find_story_similar_movies(self, selected_item: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """
        TF-IDF cosine similarity over full text (overview + keywords + tags).
        Minimum threshold 0.05 to exclude noise.
        Sorted by cosine similarity descending.
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return []

        sim_scores = cosine_similarity(
            self.tfidf_matrix[idx], self.tfidf_matrix
        ).flatten()

        results = []
        for i, score in enumerate(sim_scores):
            if i == idx or score < 0.05:
                continue
            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": round(float(score), 4),
                "reason": f"{int(round(score * 100))}% plot/story match",
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_n]

    # ── 6. Similar Rating ────────────────────────────────────────────────────
    def find_similar_rating(self, selected_item: str, top_n: int = 15) -> List[Dict[str, Any]]:
        """
        Find items with IMDB/vote_average within ±0.8 of source.
        score = 1.0 - (abs_diff / 0.8)  so closest rating = highest score.
        Within same score bucket, items with higher genre overlap are ranked first.
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return []

        src_rating = self.df.at[idx, "_rating"]
        if pd.isna(src_rating):
            return []

        src_genres: Set[str] = self.df.at[idx, "_genres_set"]
        BAND = 0.8

        results = []
        for i, r in enumerate(self.df["_rating"]):
            if i == idx or pd.isna(r):
                continue
            diff = abs(float(r) - float(src_rating))
            if diff > BAND:
                continue

            score = round(1.0 - diff / BAND, 4)
            row_genres: Set[str] = self.df.at[i, "_genres_set"]
            genre_overlap = len(src_genres & row_genres) if src_genres and row_genres else 0

            results.append({
                "title": self.df.at[i, "_canonical_title"],
                "score": score,
                "rating": round(float(r), 1),
                "rating_diff": round(diff, 2),
                "genre_overlap": genre_overlap,
                "reason": f"Rating {round(float(r), 1)} (±{round(diff, 1)} from {round(float(src_rating), 1)})",
            })

        # Sort: closest rating first, then by genre overlap as tiebreaker
        results.sort(key=lambda x: (-x["score"], -x["genre_overlap"]))
        return results[:top_n]

    # ── Unified recommend() API ───────────────────────────────────────────────
    def recommend(self, selected_item: str, top_n: int = 15) -> Dict[str, Any]:
        """
        Returns all 6 categories in a single call.
        All lists are pre-sorted by relevance score (highest first).
        """
        idx = self._resolve_movie_idx(selected_item)
        if idx is None:
            return {
                "error": f"'{selected_item}' not found.",
                "selected_item": selected_item,
                "similar_genre": [],
                "same_director_creator": [],
                "same_cast": [],
                "similar_setting": {"detected_environment": None, "category_title": None, "movies": [], "items": []},
                "story_similarity": [],
                "similar_rating": [],
            }

        canonical = self.df.at[idx, "_canonical_title"]
        src_rating = self.df.at[idx, "_rating"]

        return {
            "selected_item": canonical,
            "source_rating": round(float(src_rating), 1) if not pd.isna(src_rating) else None,
            "similar_genre": self.find_similar_genres(canonical, top_n=top_n),
            "same_director_creator": self.find_same_director_creator(canonical, top_n=top_n),
            "same_cast": self.find_same_cast(canonical, top_n=top_n),
            "similar_setting": self.find_similar_setting(canonical, top_n=top_n),
            "story_similarity": self.find_story_similar_movies(canonical, top_n=top_n),
            "similar_rating": self.find_similar_rating(canonical, top_n=top_n),
        }


# ── Specialized Sub-Classes ──────────────────────────────────────────────────
class SmartMovieRecommendationEngine(SmartBaseRecommendationEngine):
    """Movies recommendation engine."""

    def __init__(self, movie_data: Union[pd.DataFrame, List[Dict[str, Any]]]):
        super().__init__(movie_data, media_type="Movie")

    def find_same_director(self, selected_movie: str, top_n: int = 15) -> List[Dict[str, Any]]:
        return self.find_same_director_creator(selected_movie, top_n=top_n)


class SmartSeriesRecommendationEngine(SmartBaseRecommendationEngine):
    """TV Series recommendation engine."""

    def __init__(self, series_data: Union[pd.DataFrame, List[Dict[str, Any]]]):
        super().__init__(series_data, media_type="TV Series")

    def find_same_creator(self, selected_series: str, top_n: int = 15) -> List[Dict[str, Any]]:
        return self.find_same_director_creator(selected_series, top_n=top_n)


class SmartAnimeRecommendationEngine(SmartBaseRecommendationEngine):
    """Anime recommendation engine."""

    def __init__(self, anime_data: Union[pd.DataFrame, List[Dict[str, Any]]]):
        super().__init__(anime_data, media_type="Anime")

    def find_same_studio_creator(self, selected_anime: str, top_n: int = 15) -> List[Dict[str, Any]]:
        return self.find_same_director_creator(selected_anime, top_n=top_n)


# ── Factory ───────────────────────────────────────────────────────────────────
def get_recommendation_engine(
    data: Union[pd.DataFrame, List[Dict[str, Any]]],
    media_type: str = "movie",
) -> SmartBaseRecommendationEngine:
    m = media_type.lower().strip()
    if "series" in m or "tv" in m:
        return SmartSeriesRecommendationEngine(data)
    elif "anime" in m:
        return SmartAnimeRecommendationEngine(data)
    else:
        return SmartMovieRecommendationEngine(data)
