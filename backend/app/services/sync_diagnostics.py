from collections import deque
from datetime import datetime
from typing import Any, Deque, Dict, List


_EVENTS: Deque[Dict[str, Any]] = deque(maxlen=200)


def record_sync_event(direction: str, stage: str, **details: Any) -> Dict[str, Any]:
    event = {
        "timestamp": datetime.utcnow().isoformat(),
        "direction": direction,
        "stage": stage,
        **details,
    }
    _EVENTS.appendleft(event)
    return event


def recent_sync_events(limit: int = 50) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(limit, 200))
    return list(_EVENTS)[:safe_limit]
