"""
Celebrity profiles store — directors, actors, actresses.
Users can SUBSCRIBE to them and get boosted content (40% extra score) in their recommendations.
Subscribe is only for creators (directors/actors/actresses), Follow is for regular users.
"""
import json
import os
import hashlib

CELEBRITIES_FILE = os.path.join(os.path.dirname(__file__), '..', 'celebrities.json')

def _default_celebrities():
    directors = [
        "Steven Spielberg","Christopher Nolan","Martin Scorsese","Quentin Tarantino",
        "James Cameron","David Fincher","Ridley Scott","Denis Villeneuve",
        "Stanley Kubrick","Alfred Hitchcock","Francis Ford Coppola","Peter Jackson",
        "Tim Burton","Clint Eastwood","Ron Howard","George Lucas",
        "Guillermo del Toro","Wes Anderson","Christopher McQuarrie","Sam Mendes",
        "Damien Chazelle","Greta Gerwig","Bong Joon-ho","Sofia Coppola",
        "David Lynch","Paul Thomas Anderson","Robert Zemeckis","Guy Ritchie",
        "Zack Snyder","Michael Mann","Alejandro G. Iñárritu","Joel Coen",
        "Ethan Coen","Taika Waititi","Bryan Singer","J.J. Abrams",
        "Jon Favreau","Rian Johnson","Patty Jenkins","Kathryn Bigelow",
        "Edward Zwick","Baz Luhrmann","Robert Eggers","Ari Aster",
        "Todd Phillips","Jordan Peele","M. Night Shyamalan","John Carpenter",
        "James Wan","Luc Besson"
    ]
    actors = [
        "Leonardo DiCaprio","Tom Cruise","Brad Pitt","Robert Downey Jr.",
        "Christian Bale","Johnny Depp","Keanu Reeves","Ryan Reynolds",
        "Ryan Gosling","Chris Evans","Chris Hemsworth","Chris Pratt",
        "Tom Hanks","Denzel Washington","Will Smith","Matt Damon",
        "Ben Affleck","Jake Gyllenhaal","Joaquin Phoenix","Cillian Murphy",
        "Michael B. Jordan","Hugh Jackman","Jason Statham","Henry Cavill",
        "Andrew Garfield","Tobey Maguire","Tom Holland","Timothée Chalamet",
        "Robert Pattinson","Daniel Craig","Mark Ruffalo","Jeremy Renner",
        "Samuel L. Jackson","Morgan Freeman","Al Pacino","Robert De Niro",
        "Russell Crowe","Jude Law","Oscar Isaac","Pedro Pascal",
        "Colin Farrell","Brendan Fraser","Adrien Brody","Eddie Murphy",
        "Vin Diesel","Bruce Willis","Liam Neeson","Arnold Schwarzenegger",
        "Sylvester Stallone","Jason Momoa"
    ]
    actresses = [
        "Scarlett Johansson","Margot Robbie","Jennifer Lawrence","Emma Stone",
        "Emma Watson","Anne Hathaway","Natalie Portman","Charlize Theron",
        "Gal Gadot","Zendaya","Florence Pugh","Anya Taylor-Joy",
        "Jessica Chastain","Amy Adams","Emily Blunt","Sandra Bullock",
        "Julia Roberts","Nicole Kidman","Angelina Jolie","Cate Blanchett",
        "Viola Davis","Meryl Streep","Dakota Johnson","Sydney Sweeney",
        "Millie Bobby Brown","Jenna Ortega","Hailee Steinfeld","Lily Collins",
        "Ana de Armas","Elizabeth Olsen","Karen Gillan","Brie Larson",
        "Rachel McAdams","Rebecca Ferguson","Salma Hayek","Penélope Cruz",
        "Keira Knightley","Jennifer Aniston","Blake Lively","Kristen Stewart",
        "Kristen Bell","Rachel Weisz","Michelle Yeoh","Eva Green",
        "Lupita Nyong'o","Rosamund Pike","Aubrey Plaza","Amanda Seyfried",
        "Dakota Fanning","Elle Fanning"
    ]

    celebs = {}
    for name in directors:
        cid = "cel_" + hashlib.md5(name.encode()).hexdigest()[:8]
        celebs[cid] = {
            "id": cid, "name": name, "type": "director",
            "photo": f"https://ui-avatars.com/api/?name={name.replace(' ','+')}&background=ff4b2b&color=fff&size=256&bold=true&font-size=0.4",
            "subscribers": [], "subscriber_count": 0
        }
    for name in actors:
        cid = "cel_" + hashlib.md5(name.encode()).hexdigest()[:8]
        celebs[cid] = {
            "id": cid, "name": name, "type": "actor",
            "photo": f"https://ui-avatars.com/api/?name={name.replace(' ','+')}&background=6366f1&color=fff&size=256&bold=true&font-size=0.4",
            "subscribers": [], "subscriber_count": 0
        }
    for name in actresses:
        cid = "cel_" + hashlib.md5(name.encode()).hexdigest()[:8]
        celebs[cid] = {
            "id": cid, "name": name, "type": "actress",
            "photo": f"https://ui-avatars.com/api/?name={name.replace(' ','+')}&background=e91e8c&color=fff&size=256&bold=true&font-size=0.4",
            "subscribers": [], "subscriber_count": 0
        }
    return celebs


def load_celebrities():
    if not os.path.exists(CELEBRITIES_FILE):
        celebs = _default_celebrities()
        save_celebrities(celebs)
        return celebs
    with open(CELEBRITIES_FILE, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            # Migrate old "followers" fields to "subscribers" if needed
            migrated = False
            for cid, c in data.items():
                if "followers" in c and "subscribers" not in c:
                    c["subscribers"] = c.pop("followers")
                    c["subscriber_count"] = c.pop("follower_count", len(c["subscribers"]))
                    migrated = True
            if migrated:
                save_celebrities(data)
            return data
        except json.JSONDecodeError:
            celebs = _default_celebrities()
            save_celebrities(celebs)
            return celebs

def save_celebrities(celebs):
    with open(CELEBRITIES_FILE, 'w', encoding='utf-8') as f:
        json.dump(celebs, f, indent=2, ensure_ascii=False)

def get_all_celebrities(celeb_type=None):
    celebs = load_celebrities()
    result = []
    for cid, c in celebs.items():
        if celeb_type and c["type"] != celeb_type:
            continue
        result.append({
            "id": c["id"],
            "name": c["name"],
            "type": c["type"],
            "photo": c["photo"],
            "subscriber_count": c.get("subscriber_count", len(c.get("subscribers", [])))
        })
    result.sort(key=lambda x: x["subscriber_count"], reverse=True)
    return result

def search_celebrities(query: str, username: str = None):
    """Search celebrities by name, return with subscription status."""
    celebs = load_celebrities()
    query_lower = query.lower()
    results = []
    for cid, c in celebs.items():
        if query_lower in c["name"].lower():
            is_subscribed = username in c.get("subscribers", []) if username else False
            results.append({
                "id": c["id"],
                "name": c["name"],
                "type": c["type"],
                "photo": c["photo"],
                "subscriber_count": c.get("subscriber_count", len(c.get("subscribers", []))),
                "is_subscribed": is_subscribed
            })
    results.sort(key=lambda x: x["subscriber_count"], reverse=True)
    return results[:20]

def subscribe_celebrity(username, celeb_id):
    celebs = load_celebrities()
    if celeb_id not in celebs:
        return False, "Creator not found"
    if username in celebs[celeb_id].get("subscribers", []):
        return False, "Already subscribed"
    celebs[celeb_id].setdefault("subscribers", []).append(username)
    celebs[celeb_id]["subscriber_count"] = len(celebs[celeb_id]["subscribers"])
    save_celebrities(celebs)
    return True, "Subscribed successfully"

def unsubscribe_celebrity(username, celeb_id):
    celebs = load_celebrities()
    if celeb_id not in celebs:
        return False, "Creator not found"
    if username not in celebs[celeb_id].get("subscribers", []):
        return False, "Not subscribed"
    celebs[celeb_id]["subscribers"].remove(username)
    celebs[celeb_id]["subscriber_count"] = len(celebs[celeb_id]["subscribers"])
    save_celebrities(celebs)
    return True, "Unsubscribed successfully"

def get_subscribed_celebrities(username):
    celebs = load_celebrities()
    subscribed = []
    for cid, c in celebs.items():
        if username in c.get("subscribers", []):
            subscribed.append({
                "id": c["id"],
                "name": c["name"],
                "type": c["type"],
                "photo": c["photo"],
                "subscriber_count": c.get("subscriber_count", 0)
            })
    return subscribed

def get_subscribed_names(username):
    """Return dict of subscribed celeb names grouped by type (for recommendation boosting)."""
    celebs = load_celebrities()
    result = {"directors": [], "actors": [], "actresses": []}
    for cid, c in celebs.items():
        if username in c.get("subscribers", []):
            if c["type"] == "director":
                result["directors"].append(c["name"])
            elif c["type"] == "actor":
                result["actors"].append(c["name"])
            elif c["type"] == "actress":
                result["actresses"].append(c["name"])
    return result

def is_subscribed(username, celeb_id):
    celebs = load_celebrities()
    if celeb_id not in celebs:
        return False
    return username in celebs[celeb_id].get("subscribers", [])

# ── Legacy compatibility aliases (for any old code that uses follow terminology) ──
def follow_celebrity(username, celeb_id):
    return subscribe_celebrity(username, celeb_id)

def unfollow_celebrity(username, celeb_id):
    return unsubscribe_celebrity(username, celeb_id)

def get_followed_celebrities(username):
    return get_subscribed_celebrities(username)

def get_followed_names(username):
    return get_subscribed_names(username)

def is_following(username, celeb_id):
    return is_subscribed(username, celeb_id)
