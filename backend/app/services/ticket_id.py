from datetime import datetime
from typing import Optional, Union

def _parse_datetime(value: Optional[Union[str, datetime]]) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if value in (None, "", "NULL"):
        return None

    text = str(value).strip()
    if not text:
        return None

    # Replace Z or +00:00 for simple parsing
    text = text.replace("Z", "").replace("+00:00", "")
    
    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    return None


import secrets

def generate_ticket_id(
    created_at: Optional[Union[str, datetime]] = None,
    fallback_at: Optional[Union[str, datetime]] = None,
) -> str:
    dt = _parse_datetime(created_at) or _parse_datetime(fallback_at) or datetime.utcnow()
    # Add 4 chars of randomness to prevent collisions on same-second timestamps
    suffix = secrets.token_hex(2) 
    return f"TKT-{dt.strftime('%Y%m%d%H%M%S%f')}{suffix}"


def external_ticket_id(
    raw_ticket_id: Optional[Union[str, int]] = None,
    created_at: Optional[Union[str, datetime]] = None,
    fallback_at: Optional[Union[str, datetime]] = None,
) -> str:
    raw_text = str(raw_ticket_id).strip() if raw_ticket_id not in (None, "", "NULL") else ""
    if raw_text:
        return raw_text

    return generate_ticket_id(created_at=created_at, fallback_at=fallback_at)
