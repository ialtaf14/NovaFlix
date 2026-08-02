"""
Email service for FastAPI backend.
Reads credentials from core.config (which reads from .env / environment variables).
"""
import os
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def generate_otp() -> str:
    """Generate a random 6-digit verification code."""
    return str(random.randint(100000, 999999))


def _get_credentials():
    """Return (sender_email, sender_password) from config or environment."""
    try:
        from core.config import get_settings
        s = get_settings()
        return s.EMAIL_SENDER, s.EMAIL_PASSWORD
    except Exception:
        return os.environ.get("EMAIL_SENDER"), os.environ.get("EMAIL_PASSWORD")


def send_otp_email(receiver_email: str, otp: str):
    """
    Sends a 6-digit OTP email via Gmail SMTP.
    Returns (True, message) on success or (False, reason) on failure.
    Returns (False, 'SMTP_NOT_CONFIGURED') if credentials are missing — the
    API router will expose the OTP in dev_otp for local testing.
    """
    sender_email, sender_password = _get_credentials()

    # Always log for debugging
    print(f"\n{'='*40}\n[OTP] {receiver_email}: {otp}\n{'='*40}\n")

    if not sender_email or not sender_password or "PASTE_YOUR" in sender_password:
        return False, "SMTP_NOT_CONFIGURED"

    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = receiver_email
        msg['Subject'] = "NovaFlix — Your Verification Code"

        body = f"""Hello,

Your NovaFlix verification code is:

    {otp}

This code expires in 5 minutes.
If you did not request this, please ignore this email.

— NovaFlix Team
"""
        msg.attach(MIMEText(body, 'plain'))

        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.starttls()
        server.login(sender_email, sender_password)
        server.sendmail(sender_email, receiver_email, msg.as_string())
        server.quit()
        return True, "OTP sent successfully."
    except Exception as e:
        print(f"[SMTP Warning] Failed to send email via SMTP ({e}). Falling back to console OTP.")
        return False, "SMTP_NOT_CONFIGURED"
