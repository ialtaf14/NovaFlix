"""
Notifications store — file-based JSON notification storage.
"""
import json, os, time, uuid

try:
    from core.config import get_settings
    _base = os.path.dirname(get_settings().USERS_FILE)
except Exception:
    _base = os.path.join(os.path.dirname(__file__), '..', 'Files')

NOTIF_DB = os.path.join(_base, 'notifications.json')

def load_all():
    if not os.path.exists(NOTIF_DB):
        return {}
    with open(NOTIF_DB, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_all(data: dict):
    os.makedirs(os.path.dirname(NOTIF_DB), exist_ok=True)
    with open(NOTIF_DB, 'w') as f:
        json.dump(data, f, indent=2)

def get_user_notifications(username: str) -> list:
    all_data = load_all()
    notifs = all_data.get(username, [])
    notifs.sort(key=lambda n: n.get('timestamp', 0), reverse=True)
    return notifs

def add_notification(recipient: str, notif_type: str, actor: str,
                     actor_photo: str, text: str, movie: str = None):
    all_data = load_all()
    notifs = all_data.setdefault(recipient, [])
    notifs.insert(0, {
        'id': str(uuid.uuid4()),
        'type': notif_type,
        'actor': actor,
        'actor_photo': actor_photo,
        'text': text,
        'movie': movie,
        'read': False,
        'timestamp': int(time.time() * 1000)
    })
    # Keep only latest 200 per user
    all_data[recipient] = notifs[:200]
    save_all(all_data)

def mark_all_read(username: str):
    all_data = load_all()
    for n in all_data.get(username, []):
        n['read'] = True
    save_all(all_data)

def mark_one_read(username: str, notif_id: str):
    all_data = load_all()
    for n in all_data.get(username, []):
        if n['id'] == notif_id:
            n['read'] = True
    save_all(all_data)

def get_unread_count(username: str) -> int:
    return sum(1 for n in get_user_notifications(username) if not n.get('read'))

def seed_demo_notifications(username: str):
    """Seed demo notifications so UI is populated on first load."""
    FALLBACK = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"
    all_data = load_all()
    if username in all_data and all_data[username]:
        return  # Already has notifications
    t = int(time.time() * 1000)
    demos = [
        {'id': str(uuid.uuid4()), 'type': 'follow', 'actor': 'Alex Morgan', 'actor_photo': FALLBACK,
         'text': 'Alex Morgan started following you', 'movie': None, 'read': False, 'timestamp': t - 120000},
        {'id': str(uuid.uuid4()), 'type': 'like', 'actor': 'Sarah Khan', 'actor_photo': FALLBACK,
         'text': 'Sarah Khan liked your review on Interstellar', 'movie': 'Interstellar', 'read': False, 'timestamp': t - 600000},
        {'id': str(uuid.uuid4()), 'type': 'comment', 'actor': 'Daniel', 'actor_photo': FALLBACK,
         'text': 'Daniel commented: "Great movie choice 🔥"', 'movie': None, 'read': False, 'timestamp': t - 1500000},
        {'id': str(uuid.uuid4()), 'type': 'follow', 'actor': 'Michael', 'actor_photo': FALLBACK,
         'text': 'Michael and 12 others followed you', 'movie': None, 'read': True, 'timestamp': t - 3600000},
        {'id': str(uuid.uuid4()), 'type': 'activity', 'actor': 'Altaf', 'actor_photo': FALLBACK,
         'text': 'Altaf added Oppenheimer to Wishlist', 'movie': 'Oppenheimer', 'read': True, 'timestamp': t - 25200000},
        {'id': str(uuid.uuid4()), 'type': 'recommendation', 'actor': 'NovaFlix', 'actor_photo': FALLBACK,
         'text': 'New recommendations available for you', 'movie': None, 'read': True, 'timestamp': t - 10800000},
        {'id': str(uuid.uuid4()), 'type': 'activity', 'actor': 'Emma', 'actor_photo': FALLBACK,
         'text': 'Emma watched Pirates of the Caribbean', 'movie': 'Pirates of the Caribbean', 'read': True, 'timestamp': t - 86400000},
    ]
    all_data[username] = demos
    save_all(all_data)
