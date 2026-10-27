"""SMTP delivery adapter. 'Accepted' means the SMTP server took the message, nothing more."""

import smtplib
from email.message import EmailMessage

from app.config import settings


def send_email(to: str, subject: str, body: str) -> tuple[str, str | None]:
    """Return ("smtp_accepted", None) or ("failed", content-free error code)."""
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = settings.smtp_from, to, subject
    message.set_content(body)
    try:
        with smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds
        ) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password or "")
            server.send_message(message)
    except smtplib.SMTPRecipientsRefused:
        return "failed", "smtp_recipient_refused"
    except smtplib.SMTPAuthenticationError:
        return "failed", "smtp_auth_failed"
    except (smtplib.SMTPException, OSError):
        return "failed", "smtp_unavailable"
    return "smtp_accepted", None


def get_mailer():
    return send_email
