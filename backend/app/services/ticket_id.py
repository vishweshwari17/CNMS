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

    normalized = text.replace("Z", "+00:00")
    for candidate in (normalized, normalized.replace(" ", "T")):
        try:
            return datetime.fromisoformat(candidate)
        except ValueError:
            continue

    for fmt in (
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    return None


def generate_ticket_id(
    created_at: Optional[Union[str, datetime]] = None,
    fallback_at: Optional[Union[str, datetime]] = None,
) -> str:
    dt = _parse_datetime(created_at) or _parse_datetime(fallback_at) or datetime.utcnow()
    return f"TKT-{dt.strftime('%Y%m%d%H%M%S%f')}"


def external_ticket_id(
    raw_ticket_id: Optional[Union[str, int]] = None,
    created_at: Optional[Union[str, datetime]] = None,
    fallback_at: Optional[Union[str, datetime]] = None,
) -> str:
    raw_text = str(raw_ticket_id).strip() if raw_ticket_id not in (None, "", "NULL") else ""
    if raw_text:
        return raw_text

    return generate_ticket_id(created_at=created_at, fallback_at=fallback_at)
