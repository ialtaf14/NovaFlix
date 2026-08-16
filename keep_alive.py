"""
NovaFlix Render 24/7 Keep-Alive Script
======================================
Prevents Render free tier from going to sleep after 15 minutes of inactivity.
Pings https://novaflix-backend.onrender.com/api/health every 10 minutes.

Can be run standalone: python keep_alive.py
Or used automatically inside main.py on backend startup.
"""

import os
import time
import urllib.request
import logging

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
logger = logging.getLogger("KeepAlive")

PING_URL = os.getenv("RENDER_EXTERNAL_URL", "https://novaflix-backend.onrender.com").rstrip("/") + "/api/health"
INTERVAL_SECONDS = 600  # 10 minutes (Render sleeps after 15 minutes)

def ping_server():
    """Send HTTP GET request to backend health endpoint."""
    try:
        req = urllib.request.Request(
            PING_URL,
            headers={"User-Agent": "NovaFlix-KeepAlive/2.0 (Render 24/7 Bot)"}
        )
        with urllib.request.urlopen(req, timeout=15) as res:
            if res.status == 200:
                logger.info(f"❤️ Ping successful (Status 200) -> {PING_URL}")
                return True
    except Exception as e:
        logger.warning(f"⚠️ Ping warning -> {PING_URL} ({e})")
    return False

def run_loop():
    """Continuous 24/7 keep-alive loop."""
    logger.info(f"🚀 Starting NovaFlix 24/7 Keep-Alive Service for: {PING_URL}")
    logger.info(f"⏰ Ping interval: Every {INTERVAL_SECONDS // 60} minutes")
    
    while True:
        ping_server()
        time.sleep(INTERVAL_SECONDS)

if __name__ == "__main__":
    run_loop()
