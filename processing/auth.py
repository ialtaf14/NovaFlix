import json
import os
import hashlib
import bcrypt

# Path resolved from config so it works regardless of working directory
try:
    from core.config import get_settings
    USER_DB = get_settings().USERS_FILE
except Exception:
    USER_DB = os.path.join(os.path.dirname(__file__), '..', 'users.json')

def hash_password(password):
    # bcrypt limits to 72 bytes, we can hash it first with sha256 to allow any length
    pwd_bytes = hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password, hashed_password):
    # Backward compatibility for old sha256 hashes
    if not hashed_password.startswith("$2b$"):
        old_hash = hashlib.sha256(plain_password.encode('utf-8')).hexdigest()
        return old_hash == hashed_password, True # True means it needs upgrade
    
    pwd_bytes = hashlib.sha256(plain_password.encode('utf-8')).hexdigest().encode('utf-8')
    try:
        is_valid = bcrypt.checkpw(pwd_bytes, hashed_password.encode('utf-8'))
        return is_valid, False
    except ValueError:
        return False, False

def load_users():
    if not os.path.exists(USER_DB):
        return {}
    with open(USER_DB, 'r') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_users(users):
    with open(USER_DB, 'w') as f:
        json.dump(users, f, indent=4)

def signup(username, name, password, email="", photo_url=None):
    users = load_users()
    if username in users:
        return False, "Username already exists!"
    
    users[username] = {
        'name': name,
        'email': email,
        'password': hash_password(password),
        'profile': {
            'bio': 'NovaFlix Movie Enthusiast',
            'photo_url': photo_url or 'https://www.pngall.com/wp-content/uploads/5/Profile-Avatar-PNG.png'
        },
        'wishlist': [],
        'watched_list': [],
        'onboarding_completed': False,
        'preferences': {}
    }
    save_users(users)
    return True, "Account created successfully!"

def oauth_login(username, name, email, photo_url, provider_id):
    users = load_users()
    if username not in users:
        # Create user automatically for OAuth
        users[username] = {
            'name': name,
            'email': email,
            'password': hash_password(provider_id), # We use provider_id as a dummy password for oauth accounts if they ever try to login manually
            'profile': {
                'bio': f'Joined via {provider_id.split("-")[0]}',
                'photo_url': photo_url
            },
            'wishlist': [],
            'watched_list': [],
            'onboarding_completed': False,
            'preferences': {}
        }
        save_users(users)
    return True, users[username]

def login(username, password):
    users = load_users()
    if username not in users:
        return False, "User not found!"
    
    is_valid, needs_upgrade = verify_password(password, users[username]['password'])
    
    if is_valid:
        if needs_upgrade:
            users[username]['password'] = hash_password(password)
            save_users(users)
        return True, users[username]
    else:
        return False, "Incorrect password!"

def update_password(username, old_password, new_password):
    users = load_users()
    if username not in users:
        return False, "User not found!"
    
    is_valid, _ = verify_password(old_password, users[username]['password'])
    if not is_valid:
        return False, "Incorrect current password!"
    
    users[username]['password'] = hash_password(new_password)
    save_users(users)
    return True, "Password updated successfully!"

def change_username(old_username, new_username):
    users = load_users()
    if old_username not in users:
        return False, "User not found!"
    
    if new_username in users:
        return False, "Username already taken!"
        
    # Migrate data to new key
    user_data = users.pop(old_username)
    
    # Update nested interactions user_id references if any
    if "interactions" in user_data:
        for movie_id, entry in user_data["interactions"].items():
            entry["user_id"] = new_username
            
    users[new_username] = user_data
    save_users(users)
    return True, "Username updated!"

def get_user_email(username):
    users = load_users()
    if username in users:
        return users[username].get('email')
    return None

def reset_password(username, new_password):
    users = load_users()
    if username not in users:
        return False, "User not found!"
    
    users[username]['password'] = hash_password(new_password)
    save_users(users)
    return True, "Password reset successfully!"

def is_email_registered(email):
    users = load_users()
    for user_info in users.values():
        if user_info.get('email', '').strip().lower() == email.strip().lower():
            return True
    return False

def validate_username(username):
    import re
    if not username:
        return False, "Username cannot be empty."
    if len(username) > 30:
        return False, "Username must be 30 characters or less."
    if not re.match(r"^[A-Za-z0-9._]+$", username):
        return False, "Allowed characters: letters, numbers, periods (.), and underscores (_)."
    return True, ""

def validate_password_strength(password):
    if not password or len(password) < 6:
        return False, "Password must be at least 6 characters long."
    return True, ""
