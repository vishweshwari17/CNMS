import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Body, HTTPException

from app.models import db

router = APIRouter(prefix="/tickets", tags=["Tickets"])
log = logging.getLogger("cnms.tickets")

LNMS_STATUS_ENDPOINTS = {
    "LNMS-LOCAL-01": "http://127.0.0.1:8000",
    "LNMS-COMPANY-01": "http://192.78.10.111:8000",
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
    url = LNMS_STATUS_ENDPOINTS.get(node)
    if not url:
        log.warning("No LNMS status endpoint configured for node %s", node)
        return False

    payload = {
        "ticket_id": _ticket_external_ref(ticket),
        "ticket_uid": ticket.get("ticket_uid"),
        "short_id": ticket.get("short_id"),
        "alarm_uid": ticket.get("alarm_uid"),
        "status": status_value,
        "resolved_at": str(ticket.get("resolved_at") or datetime.utcnow()),
        "resolution_note": note,
        "last_updated_by": "cnms",
        "sync_version": (ticket.get("sync_version") or 1) + 1,
    }

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.put(url, json=payload)
            response.raise_for_status()
        log.info("Pushed ticket status %s to LNMS for %s", status_value, payload["ticket_id"])
        return True
    except Exception:
        log.exception("LNMS status push failed for ticket %s", payload["ticket_id"])
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
