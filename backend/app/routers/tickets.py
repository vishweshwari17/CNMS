import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Body, HTTPException

from app.models import db
from app.services.sync_diagnostics import record_sync_event, recent_sync_events

router = APIRouter(prefix="/tickets", tags=["Tickets"])
log = logging.getLogger("cnms.tickets")

LNMS_STATUS_ENDPOINTS = {
    "LNMS-LOCAL-01": [
        ("PUT", "http://127.0.0.1:8000/tickets/update_from_cnms"),
        ("POST", "http://127.0.0.1:8000/cnms/update-ticket"),
    ],
    "LNMS-COMPANY-01": [
        ("PUT", "http://127.0.0.1:8000/tickets/update_from_cnms"),
        ("POST", "http://127.0.0.1:8000/cnms/update-ticket"),
    ],
}


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


async def push_ticket_status(ticket: dict, status_value: str, note: str = ""):
    node = ticket.get("lnms_node_id")
    endpoints = LNMS_STATUS_ENDPOINTS.get(node)
    if not endpoints:
        log.warning("No LNMS status endpoint configured for node %s", node)
        return False

    external_ticket_id = _ticket_external_ref(ticket)
    payload = {
        "ticket_id": external_ticket_id,
        "ticket_uid": ticket.get("ticket_uid"),
        "short_id": ticket.get("short_id"),
        "alarm_uid": ticket.get("alarm_uid"),
        "status": status_value,
        "resolved_at": str(ticket.get("resolved_at") or datetime.utcnow()),
        "resolution_note": note,
        "resolved_note": note,
        "note": note,
        "last_updated_by": "cnms",
        "sync_version": (ticket.get("sync_version") or 1) + 1,
        "comments": [],
    }

    record_sync_event(
        "outbound",
        "ticket_status_attempt",
        node=node,
        ticket_id=external_ticket_id,
        status=status_value,
        payload=payload,
    )

    async with httpx.AsyncClient(timeout=5) as client:
        for method, url in endpoints:
            try:
                response = await client.request(method, url, json=payload)
                response.raise_for_status()
                record_sync_event(
                    "outbound",
                    "ticket_status_success",
                    node=node,
                    ticket_id=external_ticket_id,
                    status=status_value,
                    method=method,
                    url=url,
                )
                log.info("Pushed ticket status %s to LNMS for %s via %s %s", status_value, external_ticket_id, method, url)
                return True
            except Exception:
                record_sync_event(
                    "outbound",
                    "ticket_status_failure",
                    node=node,
                    ticket_id=external_ticket_id,
                    status=status_value,
                    method=method,
                    url=url,
                )
                log.warning("LNMS status push failed via %s %s for ticket %s", method, url, external_ticket_id, exc_info=True)

    return False


async def add_message(ticket_id: int, sender: str, message: str, push: bool = True):
    await db.execute(
        """
        INSERT INTO ticket_conversations (ticket_id, sender, message, created_at)
        VALUES (%s, %s, %s, NOW())
        """,
        (ticket_id, sender, message),
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
        "SELECT * FROM ticket_conversations WHERE ticket_id=%s ORDER BY created_at",
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
    updated_ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    await add_message(id, "CNMS", "Ticket acknowledged", push=False)
    lnms_synced = await push_ticket_status(updated_ticket, "ACK", "Ticket acknowledged")
    return {"ok": True, "lnms_synced": lnms_synced}


@router.put("/{id}/resolve")
async def resolve_ticket(id: int, payload: dict = Body(...)):
    ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    note = (payload.get("resolution_note") or "").strip()
    await db.execute(
        "UPDATE tickets SET status='RESOLVED', resolved_at=NOW(), updated_at=NOW(), resolution_note=%s WHERE id=%s",
        (note, id),
    )
    updated_ticket = await db.fetchone("SELECT * FROM tickets WHERE id=%s", (id,))
    await add_message(id, "CNMS", f"Resolved: {note or 'Resolved via CNMS'}", push=False)
    lnms_synced = await push_ticket_status(updated_ticket, "RESOLVED", note)
    return {"ok": True, "lnms_synced": lnms_synced}
