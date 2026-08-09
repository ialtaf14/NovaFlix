"""
Enhanced chat store — SQLite storage with reactions,
seen-status, typing, movie cards, and conversation metadata.
"""
import json, os, time, uuid, sqlite3
from typing import Optional

try:
    from core.config import get_settings
    _base = os.path.dirname(get_settings().USERS_FILE)
except Exception:
    _base = os.path.join(os.path.dirname(__file__), '..', 'Files')

DB_PATH = os.path.join(_base, 'chats.db')
OLD_JSON = os.path.join(_base, 'chats.json')
FALLBACK = "https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png"

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db() as conn:
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT,
            created_at INTEGER
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS conversation_members (
            conversation_id TEXT,
            username TEXT,
            role TEXT,
            cleared_at INTEGER DEFAULT 0,
            pinned BOOLEAN DEFAULT 0,
            joined_at INTEGER,
            PRIMARY KEY (conversation_id, username)
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            sender TEXT,
            content TEXT,
            type TEXT,
            movie_data TEXT,
            reply_to TEXT,
            deleted BOOLEAN DEFAULT 0,
            edited BOOLEAN DEFAULT 0,
            timestamp INTEGER
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS message_status (
            message_id TEXT,
            username TEXT,
            is_seen BOOLEAN DEFAULT 0,
            is_deleted BOOLEAN DEFAULT 0,
            is_starred BOOLEAN DEFAULT 0,
            PRIMARY KEY (message_id, username)
        )''')
        c.execute('''CREATE TABLE IF NOT EXISTS reactions (
            message_id TEXT,
            username TEXT,
            emoji TEXT,
            PRIMARY KEY (message_id, username)
        )''')
        
        # Check if migration needed
        c.execute("SELECT COUNT(*) FROM conversations")
        if c.fetchone()[0] == 0 and os.path.exists(OLD_JSON):
            _migrate_from_json(conn)
        conn.commit()

def _migrate_from_json(conn):
    try:
        with open(OLD_JSON, 'r') as f:
            data = json.load(f)
            if isinstance(data, list):
                return
    except Exception:
        return
    
    c = conn.cursor()
    for key, conv in data.items():
        c.execute("INSERT OR IGNORE INTO conversations (id, type, created_at) VALUES (?, ?, ?)",
                  (key, 'direct', int(time.time() * 1000)))
        
        parts = key.split("__")
        if len(parts) == 2:
            for u in parts:
                pinned = 1 if conv.get("pinned_by", {}).get(u) else 0
                cleared_at = conv.get("cleared_by", {}).get(u, 0)
                c.execute("""INSERT OR IGNORE INTO conversation_members 
                             (conversation_id, username, role, cleared_at, pinned, joined_at)
                             VALUES (?, ?, 'member', ?, ?, ?)""",
                          (key, u, cleared_at, pinned, int(time.time() * 1000)))

        for m in conv.get("messages", []):
            msg_id = m.get("id", str(uuid.uuid4()))
            mdata = json.dumps(m.get("movie_data")) if m.get("movie_data") else None
            c.execute("""INSERT OR IGNORE INTO messages 
                         (id, conversation_id, sender, content, type, movie_data, reply_to, deleted, edited, timestamp)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                      (msg_id, key, m.get("sender"), m.get("content"), m.get("type", "text"),
                       mdata, m.get("reply_to"), 1 if m.get("deleted") else 0,
                       1 if m.get("edited") else 0, m.get("timestamp")))
            
            # Message status
            for u in parts:
                is_seen = 1 if (u != m.get("sender") and m.get("seen")) or u == m.get("sender") else 0
                is_deleted = 1 if u in m.get("deleted_for", []) else 0
                is_starred = 1 if u in m.get("starred_by", []) else 0
                c.execute("""INSERT OR IGNORE INTO message_status
                             (message_id, username, is_seen, is_deleted, is_starred)
                             VALUES (?, ?, ?, ?, ?)""",
                          (msg_id, u, is_seen, is_deleted, is_starred))
            
            # Reactions
            for reactor, emoji in m.get("reactions", {}).items():
                c.execute("INSERT OR IGNORE INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)",
                          (msg_id, reactor, emoji))
    conn.commit()

init_db()

def _conv_key(u1: str, u2: str) -> str:
    return "__".join(sorted([u1, u2]))

def get_conversation(user1: str, user2: str, limit: int = 50, offset: int = 0, is_group: bool = False) -> list:
    conn = get_db()
    c = conn.cursor()
    conv_id = user2 if is_group else _conv_key(user1, user2)
    
    c.execute("SELECT cleared_at FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, user1))
    row = c.fetchone()
    cleared_at = row['cleared_at'] if row else 0

    c.execute("""
        SELECT m.*, ms.is_deleted, ms.is_starred
        FROM messages m
        LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.username = ?
        WHERE m.conversation_id = ? AND m.timestamp > ? AND (ms.is_deleted IS NULL OR ms.is_deleted = 0)
        ORDER BY m.timestamp DESC LIMIT ? OFFSET ?
    """, (user1, conv_id, cleared_at, limit, offset))
    
    rows = c.fetchall()
    
    # Mark as seen
    msg_ids_to_mark = [r['id'] for r in rows if r['sender'] != user1]
    if msg_ids_to_mark:
        placeholders = ','.join(['?'] * len(msg_ids_to_mark))
        c.execute(f"UPDATE message_status SET is_seen = 1 WHERE username = ? AND message_id IN ({placeholders})", [user1] + msg_ids_to_mark)
        conn.commit()
    
    msgs = []
    for r in reversed(rows):
        msg = dict(r)
        msg['movie_data'] = json.loads(msg['movie_data']) if msg['movie_data'] else None

        # Get reactions — shape: { emoji: [usernames] } (what the UI renders)
        c.execute("SELECT username, emoji FROM reactions WHERE message_id = ?", (msg['id'],))
        reactions = {}
        for row in c.fetchall():
            reactions.setdefault(row['emoji'], []).append(row['username'])
        msg['reactions'] = reactions

        # Seen status: for my own messages, has the other side seen it?
        if msg['sender'] == user1 and not is_group:
            c.execute("SELECT is_seen FROM message_status WHERE message_id = ? AND username = ?",
                      (msg['id'], user2))
            seen_row = c.fetchone()
            msg['seen'] = bool(seen_row['is_seen']) if seen_row else False
        else:
            msg['seen'] = True
        msgs.append(msg)

    return msgs

def get_conversations_list(username: str) -> list:
    conn = get_db()
    c = conn.cursor()
    
    c.execute("""
        SELECT cm.conversation_id, cm.pinned, c.type, c.name, cm.cleared_at
        FROM conversation_members cm
        JOIN conversations c ON cm.conversation_id = c.id
        WHERE cm.username = ?
    """, (username,))
    
    convs = c.fetchall()
    result = []
    for conv in convs:
        conv_id = conv['conversation_id']
        cleared_at = conv['cleared_at']
        
        # Get last message
        c.execute("""
            SELECT m.*
            FROM messages m
            LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.username = ?
            WHERE m.conversation_id = ? AND m.timestamp > ? AND (ms.is_deleted IS NULL OR ms.is_deleted = 0)
            ORDER BY m.timestamp DESC LIMIT 1
        """, (username, conv_id, cleared_at))
        last_msg = c.fetchone()
        
        if not last_msg and conv['type'] == 'direct':
            continue
            
        # Get unread count
        c.execute("""
            SELECT COUNT(*) FROM messages m
            LEFT JOIN message_status ms ON m.id = ms.message_id AND ms.username = ?
            WHERE m.conversation_id = ? AND m.sender != ? AND (ms.is_seen IS NULL OR ms.is_seen = 0) AND m.timestamp > ? AND (ms.is_deleted IS NULL OR ms.is_deleted = 0)
        """, (username, conv_id, username, cleared_at))
        unread = c.fetchone()[0]
        
        other = ""
        if conv['type'] == 'direct':
            parts = conv_id.split("__")
            other = parts[0] if parts[1] == username else parts[1]
        
        content_preview = ""
        msg_timestamp = 0
        if last_msg:
            raw = last_msg['content']
            if raw and raw.startswith("[MOVIE_SHARE:"):
                content_preview = "🎬 Shared a movie"
            elif raw and raw.startswith("http") and (".gif" in raw or ".jpg" in raw or ".png" in raw):
                content_preview = "📷 Shared media"
            else:
                content_preview = raw[:80] if raw else ""
            msg_timestamp = last_msg['timestamp']
            
        result.append({
            "id": conv_id,
            "type": conv['type'],
            "name": conv['name'] if conv['type'] == 'group' else None,
            "username": other,  # for direct chats
            "last_message": content_preview,
            "last_message_timestamp": msg_timestamp,
            "unread_count": unread,
            "pinned": bool(conv['pinned']),
        })
        
    result.sort(key=lambda x: x["last_message_timestamp"] or 0, reverse=True)
    return result

def save_message(sender: str, receiver: str, content: str,
                 msg_type: str = "text", movie_data: dict = None,
                 reply_to: str = None, is_group: bool = False) -> dict:
    conn = get_db()
    c = conn.cursor()
    conv_id = receiver if is_group else _conv_key(sender, receiver)
    
    if not is_group:
        c.execute("INSERT OR IGNORE INTO conversations (id, type, created_at) VALUES (?, 'direct', ?)",
                  (conv_id, int(time.time() * 1000)))
        c.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, username, role, joined_at) VALUES (?, ?, 'member', ?)",
                  (conv_id, sender, int(time.time() * 1000)))
        c.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, username, role, joined_at) VALUES (?, ?, 'member', ?)",
                  (conv_id, receiver, int(time.time() * 1000)))
    
    msg_id = str(uuid.uuid4())
    t = int(time.time() * 1000)
    mdata = json.dumps(movie_data) if movie_data else None
    
    c.execute("""
        INSERT INTO messages (id, conversation_id, sender, content, type, movie_data, reply_to, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (msg_id, conv_id, sender, content, msg_type, mdata, reply_to, t))
    
    # Initialize message status for all members
    c.execute("SELECT username FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    members = c.fetchall()
    for mem in members:
        u = mem['username']
        is_seen = 1 if u == sender else 0
        c.execute("INSERT INTO message_status (message_id, username, is_seen) VALUES (?, ?, ?)",
                  (msg_id, u, is_seen))
    
    conn.commit()
    
    return {
        "id": msg_id,
        "sender": sender,
        "receiver": receiver,
        "content": content,
        "type": msg_type,
        "movie_data": movie_data,
        "reply_to": reply_to,
        "reactions": {},
        "seen": False,
        "deleted": False,
        "edited": False,
        "timestamp": t
    }

def add_reaction(user1: str, user2: str, msg_id: str, reactor: str, emoji: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    
    if emoji:
        c.execute("INSERT OR REPLACE INTO reactions (message_id, username, emoji) VALUES (?, ?, ?)",
                  (msg_id, reactor, emoji))
    else:
        c.execute("DELETE FROM reactions WHERE message_id = ? AND username = ?",
                  (msg_id, reactor))
    conn.commit()

def delete_message(user1: str, user2: str, msg_id: str, requester: str, for_everyone: bool = False, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    
    if for_everyone:
        # Instagram style Unsend: permanently delete message for both parties
        c.execute("DELETE FROM messages WHERE id = ? AND sender = ?", (msg_id, requester))
        c.execute("DELETE FROM message_status WHERE message_id = ?", (msg_id,))
        c.execute("DELETE FROM reactions WHERE message_id = ?", (msg_id,))
    else:
        # Delete for me only
        c.execute("INSERT OR REPLACE INTO message_status (message_id, username, is_deleted) VALUES (?, ?, 1)",
                  (msg_id, requester))
    conn.commit()

def clear_chat(user1: str, user2: str, requester: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    conv_id = user2 if is_group else _conv_key(user1, user2)
    
    c.execute("UPDATE conversation_members SET cleared_at = ? WHERE conversation_id = ? AND username = ?",
              (int(time.time() * 1000), conv_id, requester))
    conn.commit()

def edit_message(user1: str, user2: str, msg_id: str, requester: str, new_content: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    c.execute("UPDATE messages SET content = ?, edited = 1 WHERE id = ? AND sender = ? AND deleted = 0",
              (new_content, msg_id, requester))
    conn.commit()

def toggle_star_message(user1: str, user2: str, msg_id: str, requester: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT is_starred FROM message_status WHERE message_id = ? AND username = ?", (msg_id, requester))
    row = c.fetchone()
    current = row['is_starred'] if row else 0
    new_val = 0 if current else 1
    
    if not row:
        c.execute("INSERT INTO message_status (message_id, username, is_starred) VALUES (?, ?, ?)", (msg_id, requester, new_val))
    else:
        c.execute("UPDATE message_status SET is_starred = ? WHERE message_id = ? AND username = ?", (new_val, msg_id, requester))
    conn.commit()

def delete_conversation(user1: str, user2: str):
    conn = get_db()
    c = conn.cursor()
    conv_id = _conv_key(user1, user2)
    
    c.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
    c.execute("DELETE FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    c.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
    conn.commit()

def toggle_pin(user1: str, user2: str, requester: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    conv_id = user2 if is_group else _conv_key(user1, user2)
    
    c.execute("SELECT pinned FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, requester))
    row = c.fetchone()
    current = row['pinned'] if row else 0
    new_val = 0 if current else 1
    
    c.execute("UPDATE conversation_members SET pinned = ? WHERE conversation_id = ? AND username = ?", (new_val, conv_id, requester))
    conn.commit()

def mark_all_read(target: str, requester: str, is_group: bool = False):
    conn = get_db()
    c = conn.cursor()
    conv_id = target if is_group else _conv_key(target, requester)
    
    c.execute("""
        UPDATE message_status 
        SET is_seen = 1 
        WHERE username = ? AND message_id IN (
            SELECT id FROM messages WHERE conversation_id = ? AND sender != ?
        )
    """, (requester, conv_id, requester))
    conn.commit()

def mark_read(msg_id: str, requester: str):
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO message_status (message_id, username, is_seen) VALUES (?, ?, 1) ON CONFLICT DO UPDATE SET is_seen = 1", (msg_id, requester))
    conn.commit()

def seed_demo_messages(username: str, other_users: list):
    # Disabled so no dummy messages are ever auto-seeded into any account
    return


# Group chat functions

def create_group(name: str, creator: str, members: list) -> str:
    conn = get_db()
    c = conn.cursor()
    conv_id = "group_" + str(uuid.uuid4())
    t = int(time.time() * 1000)
    
    c.execute("INSERT INTO conversations (id, type, name, created_at) VALUES (?, 'group', ?, ?)", (conv_id, name, t))
    c.execute("INSERT INTO conversation_members (conversation_id, username, role, joined_at) VALUES (?, ?, 'admin', ?)", (conv_id, creator, t))
    
    for m in members:
        if m != creator:
            c.execute("INSERT INTO conversation_members (conversation_id, username, role, joined_at) VALUES (?, ?, 'member', ?)", (conv_id, m, t))
            
    conn.commit()
    return conv_id

def add_group_member(conv_id: str, adder: str, new_member: str):
    conn = get_db()
    c = conn.cursor()
    
    c.execute("SELECT role FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, adder))
    row = c.fetchone()
    if not row or row['role'] != 'admin':
        raise Exception("Only admins can add members")
        
    c.execute("INSERT OR IGNORE INTO conversation_members (conversation_id, username, role, joined_at) VALUES (?, ?, 'member', ?)",
              (conv_id, new_member, int(time.time() * 1000)))
    conn.commit()

def remove_group_member(conv_id: str, admin: str, member: str):
    conn = get_db()
    c = conn.cursor()
    
    if admin != member:
        c.execute("SELECT role FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, admin))
        row = c.fetchone()
        if not row or row['role'] != 'admin':
            raise Exception("Only admins can remove members")
            
    c.execute("DELETE FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, member))
    conn.commit()

def update_group_role(conv_id: str, admin: str, member: str, role: str):
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT role FROM conversation_members WHERE conversation_id = ? AND username = ?", (conv_id, admin))
    row = c.fetchone()
    if not row or row['role'] != 'admin':
        raise Exception("Only admins can change roles")
        
    c.execute("UPDATE conversation_members SET role = ? WHERE conversation_id = ? AND username = ?", (role, conv_id, member))
    conn.commit()

def get_group_details(conv_id: str) -> dict:
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    conv = c.fetchone()
    if not conv:
        return None
        
    c.execute("SELECT username, role, joined_at FROM conversation_members WHERE conversation_id = ?", (conv_id,))
    members = [dict(r) for r in c.fetchall()]
    
    return {
        "id": conv['id'],
        "name": conv['name'],
        "created_at": conv['created_at'],
        "members": members
    }
