# app/services/correlation_engine.py
import logging
from datetime import datetime, timedelta
from app.models import db

log = logging.getLogger("cnms.correlation")

async def correlate_incident(new_ticket_id: int, alarm_uid: str, device_name: str, lnms_node_id: str):
    """
    Search for existing open tickets on the same device or node within a 15-minute window.
    If found, link them (this is a simplified version of correlation).
    """
    try:
        # 1. Find potential related tickets
        # Criteria: same device_name OR same lnms_node_id, status != 'CLOSED', within last 15 mins
        window = datetime.utcnow() - timedelta(minutes=15)
        
        related = await db.fetchall(
            """SELECT id, title FROM tickets 
               WHERE id != %s 
                 AND status != 'CLOSED'
                 AND (device_name = %s OR lnms_node_id = %s)
                 AND created_at >= %s""",
            (new_ticket_id, device_name, lnms_node_id, window)
        )
        
        if related:
            log.info(f"[CORRELATION] Ticket {new_ticket_id} matches {len(related)} existing tickets")
            # In a real system, we might merge them or add a 'parent_id'.
            # For now, we'll just log it and potentially update the ticket title/description.
            ids = [r["id"] for r in related]
            note = f"Linked to related incidents: {', '.join(map(str, ids))}"
            
            await db.execute(
                "UPDATE tickets SET description = CONCAT(description, %s) WHERE id = %s",
                (f"\n\n[AUTO-CORRELATION] {note}", new_ticket_id)
            )
            return True
            
    except Exception as e:
        log.error(f"[CORRELATION] Failed: {e}")
    
    return False

def predict_priority(severity: str, device_type: str = "Other") -> str:
    """
    Predict urgency based on severity and device criticality.
    """
    critical_devices = ["Router", "Switch", "Firewall", "Core"]
    
    if severity == "Critical":
        return "CRITICAL"
    if severity == "Major" and any(d in device_type for d in critical_devices):
        return "CRITICAL"
    if severity == "Major":
        return "HIGH"
    if severity == "Minor":
        return "MEDIUM"
        
    return "LOW"
