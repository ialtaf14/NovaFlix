"""
Shared in-memory presence registry.

main.py's socket handlers write to this on connect/disconnect;
REST routers (chat) read from it to report real online status.
Single-process only — fine for this app's deployment model.
"""
import time

# { username: last_seen_epoch } — value None means currently online
_online: dict = {}
_last_seen: dict = {}


def set_online(username: str):
    if username and username != "anonymous":
        _online[username] = True


def set_offline(username: str):
    if username in _online:
        del _online[username]
    if username and username != "anonymous":
        _last_seen[username] = int(time.time())


def is_online(username: str) -> bool:
    return username in _online


def get_last_seen(username: str):
    """Epoch seconds of last disconnect, or None if never seen / online now."""
    if is_online(username):
        return None
    return _last_seen.get(username)


def online_users() -> list:
    return list(_online.keys())
