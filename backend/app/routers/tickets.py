import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Body, HTTPException

from app.models import db
from app.services.sync_diagnostics import record_sync_event, recent_sync_events

router = APIRouter(prefix="/tickets", tags=["Tickets"])
log = logging.getLogger("cnms.tickets")




def _ticket_external_ref(ticket: dict):
    return (
        ticket.get("ticket_uid")
        or ticket.get("global_ticket_id")
        or ticket.get("short_id")
        or ticket.get("alarm_uid")
        or ticket.get("id")
    )


async def _find_ticket(ticket_ref: str):
    return await db.fetchone(
        """
        SELECT *
        FROM tickets
        WHERE CAST(id AS CHAR)=%s
           OR short_id=%s
           OR ticket_uid=%s
           OR alarm_uid=%s
        LIMIT 1
        """,
        (ticket_ref, ticket_ref, ticket_ref, ticket_ref),
    )


async def push_message_to_lnms(ticket: dict, sender: str, message: str):
    # Message sync is best-effort only until the LNMS message endpoint contract is standardized.
    log.info(
        "Skipping outbound LNMS message sync for ticket %s from %s",
        _ticket_external_ref(ticket),
        sender,
    )


from app.services.dual_lnms_sync import push_status_to_source

async def push_ticket_status(ticket: dict, status_value: str, note: str = ""):
    node = ticket.get("lnms_node_id")
    ticket_uid = ticket.get("ticket_uid")
    alarm_uid = ticket.get("alarm_uid")
    
    if not node:
        log.warning("Ticket %s has no node_id, cannot sync status", ticket.get("id"))
        return False

    record_sync_event(
        "outbound",
        "ticket_status_attempt",
        node=node,
        ticket_id=ticket_uid or alarm_uid,
        status=status_value,
    )

    success = await push_status_to_source(node, ticket_uid, alarm_uid, status_value)
    
    if success:
        record_sync_event(
            "outbound",
            "ticket_status_success",
            node=node,
            ticket_id=ticket_uid or alarm_uid,
            status=status_value,
        )
        return True
    else:
        record_sync_event(
            "outbound",
            "ticket_status_failure",
            node=node,
            ticket_id=ticket_uid or alarm_uid,
            status=status_value,
        )
        return False


async def add_message(ticket_id: int, sender: str, message: str, msg_type: str = "COMMENT", push: bool = True):
    await db.execute(
        """
        INSERT INTO ticket_messages (ticket_id, sender, msg_type, body, sent_at)
        VALUES (%s, %s, %s, %s, NOW())
        """,
        (ticket_id, sender, msg_type, message),
    )

    if push:
        ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (ticket_id,))
        if ticket:
            await push_message_to_lnms(ticket, sender, message)


@router.get("")
async def list_tickets():
    return await db.fetchall(
        """
        SELECT *
        FROM tickets
        ORDER BY created_at DESC
        LIMIT 500
        """
    )


@router.get("/diag/sync-log")
async def ticket_sync_log(limit: int = 50):
    return {
        "items": recent_sync_events(limit),
        "count": min(max(limit, 1), 200),
    }


@router.get("/{ticket_ref}")
async def get_ticket(ticket_ref: str):
    ticket = await _find_ticket(ticket_ref)
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    messages = await db.fetchall(
        "SELECT id, ticket_id, sender, msg_type, body, sent_at, is_resolved FROM ticket_messages WHERE ticket_id=%s ORDER BY sent_at",
        (ticket["id"],),
    )
    ticket["messages"] = messages
    return ticket

@router.get("/{id}/sla")
async def get_ticket_sla(id: int):
    ticket = await db.fetchone(
        "SELECT id, sla_used, sla_limit_minutes, sla_minutes, sla_status FROM tickets WHERE id=%s", (id,)
    )
    if not ticket:
        raise HTTPException(404, "Ticket not found")
        
    return {
        "ticket_id": ticket["id"],
        "elapsed_time": ticket["sla_used"] or 0,
        "sla_limit": ticket["sla_limit_minutes"] or ticket["sla_minutes"] or 60,
        "sla_status": ticket["sla_status"] or "ON_TIME"
    }


@router.post("/{id}/comment")
async def comment_ticket(id: int, payload: dict = Body(...)):
    msg = payload.get("message")
    sender = payload.get("sender", "USER")
    if not msg or not msg.strip():
        raise HTTPException(400, "Cannot send empty message")

    ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    await add_message(id, sender, msg)
    return {"ok": True}


@router.put("/{id}/ack")
async def ack_ticket(id: int):
    ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    await db.execute(
        "UPDATE tickets SET status='ACK', updated_at=NOW() WHERE id=%s",
        (id,),
    )
    if ticket.get("alarm_uid"):
        await db.execute(
            "UPDATE alarms SET status='ACK' WHERE alarm_uid=%s",
            (ticket["alarm_uid"],),
        )
    updated_ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    await add_message(id, "CNMS", "Ticket acknowledged", msg_type="STATUS_CHANGE", push=False)
    lnms_synced = await push_ticket_status(updated_ticket, "ACK", "Ticket acknowledged")
    return {"ok": True, "lnms_synced": lnms_synced}


@router.put("/{id}/resolve")
async def resolve_ticket(id: int, payload: dict = Body(...)):
    ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    note = (payload.get("resolution_note") or "").strip()
    await db.execute(
        """UPDATE tickets 
           SET status='RESOLVED', 
               resolved_at=NOW(), 
               updated_at=NOW(), 
               resolution_note=%s,
               resolved_by='CNMS',
               alarm_status='Resolved by CNMS'
           WHERE id=%s""",
        (note, id),
    )
    # Sync status to corresponding alarm
    if ticket.get("alarm_uid"):
        await db.execute(
            "UPDATE alarms SET status='RESOLVED', resolved_at=NOW() WHERE alarm_uid=%s",
            (ticket["alarm_uid"],),
        )

    updated_ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    await add_message(id, "CNMS", f"Resolved: {note or 'Resolved via CNMS'}", msg_type="TICKET_RESOLVED", push=False)
    lnms_synced = await push_ticket_status(updated_ticket, "RESOLVED", note)
    return {"ok": True, "lnms_synced": lnms_synced}


@router.put("/{id}/close")
async def close_ticket(id: int):
    ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    await db.execute(
        "UPDATE tickets SET status='CLOSED', updated_at=NOW() WHERE id=%s",
        (id,),
    )
    # Sync status to corresponding alarm
    if ticket.get("alarm_uid"):
        await db.execute(
            "UPDATE alarms SET status='CLOSED' WHERE alarm_uid=%s",
            (ticket["alarm_uid"],),
        )

    updated_ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    await add_message(id, "CNMS", "Ticket closed", msg_type="STATUS_CHANGE", push=False)
    lnms_synced = await push_ticket_status(updated_ticket, "CLOSED", "Ticket closed")
    return {"ok": True, "lnms_synced": lnms_synced}
