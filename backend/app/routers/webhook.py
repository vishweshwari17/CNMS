# app/routers/webhook.py
"""
Company PHP LNMS → CNMS Webhook Receiver

The company LNMS (192.78.10.111) POSTs JSON to:
  POST http://<your-cnms-ip>:8001/webhook/lnms

Configure the company PHP LNMS to send a webhook to this URL.
Supports a shared secret via header: X-LNMS-Secret

Set env vars:
  WEBHOOK_SECRET  = your-secret-key   (set same value in company LNMS config)
  COMPANY_NODE_ID = LNMS-COMPANY-01
"""

import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Request

from app.models import db
from app.services.ticket_id import external_ticket_id
from app.services.sync_diagnostics import record_sync_event
from app.services.ws_manager import WebSocketManager

log = logging.getLogger("cnms.webhook")
router = APIRouter(tags=["Webhook"])

WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "supersecret123")
COMPANY_NODE_ID = os.getenv("COMPANY_NODE_ID", "LNMS-COMPANY-01")

ws_manager: Optional[WebSocketManager] = None

SLA_MAP = {
    "Critical": 60,
    "Major":    240,
    "Minor":    480,
    "Warning":  1440,
    "Info":     2880,
}

@router.post("/lnms")
async def lnms_entry(data: dict, x_lnms_secret: str = Header(None)):
    if WEBHOOK_SECRET and x_lnms_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return {"message": "LNMS endpoint working"}

@router.post("/webhook/lnms")
async def receive_webhook(
    request: Request,
    x_lnms_secret: Optional[str] = Header(None),
):
    # Optional secret validation
    if WEBHOOK_SECRET and x_lnms_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    msg_type = payload.get("msg_type") or payload.get("type") or payload.get("event_type", "UNKNOWN")
    node_id  = payload.get("node_id") or payload.get("lnms_node_id") or COMPANY_NODE_ID

    record_sync_event(
        "inbound",
        "webhook_received",
        node=node_id,
        msg_type=msg_type,
        ticket_id=payload.get("ticket_id") or payload.get("ticket_uid"),
        alarm_uid=payload.get("alarm_uid") or payload.get("alarm_id"),
    )

    log.info(f"[Webhook] Received {msg_type} from {node_id}")

    # Log to tcp_sync_log
    await _log_sync(node_id, msg_type)

    # Upsert the node as connected
    await _upsert_node(node_id, request.client.host if request.client else "unknown")

    handler = {
        "ALARM_NEW":      _handle_alarm_new,
        "alarm_new":      _handle_alarm_new,
        "alarm":          _handle_alarm_new,
        "ALARM_RESOLVED": _handle_alarm_resolved,
        "alarm_resolved": _handle_alarm_resolved,
        "DEVICE_UPDATE":  _handle_device,
        "device_update":  _handle_device,
        "device":         _handle_device,
        "DEVICE_SYNC":    _handle_device_sync,
        "HEARTBEAT":      _handle_heartbeat,
        "heartbeat":      _handle_heartbeat,
    }.get(msg_type)

    if handler:
        await handler(payload, node_id)
    else:
        log.warning(f"[Webhook] Unknown msg_type: {msg_type} — storing raw")

    # Broadcast to browser
    if ws_manager:
        await ws_manager.broadcast({"event": msg_type, "node": node_id})

    return {"status": "ok", "msg_type": msg_type, "node": node_id}


# ── Handlers ─────────────────────────────────────────────────

async def _handle_alarm_new(payload: dict, node_id: str):
    alarm_uid   = payload.get("alarm_uid") or payload.get("alarm_id") or f"WH-{int(time.time())}"
    lnms_ticket_id = payload.get("ticket_id") or payload.get("ticket_uid")
    device_name = payload.get("device_name") or payload.get("host") or payload.get("hostname", "unknown")
    alarm_type  = payload.get("alarm_type") or payload.get("type") or payload.get("name", "Unknown")
    severity    = _normalize_severity(payload.get("severity") or payload.get("priority", "Info"))
    description = payload.get("description") or payload.get("message", "")

    await db.execute(
        """INSERT INTO alarms
           (alarm_uid, lnms_node_id, device_name, alarm_type, severity, status, raised_at)
           VALUES (%s,%s,%s,%s,%s,'Active',NOW())
           ON DUPLICATE KEY UPDATE
             severity=VALUES(severity), alarm_type=VALUES(alarm_type), status='Active'""",
        (alarm_uid, node_id, device_name, alarm_type, severity),
    )

    # Auto-create ticket
    ticket_uid = external_ticket_id(
        raw_ticket_id=lnms_ticket_id,
        created_at=payload.get("created_at") or payload.get("raised_at") or payload.get("problem_time"),
    )
    short_id   = ticket_uid
    title      = payload.get("title") or f"{alarm_type} on {device_name}"
    sla        = SLA_MAP.get(severity, 480)

    existing_ticket = await db.fetchone(
        "SELECT id FROM tickets WHERE alarm_uid=%s LIMIT 1",
        (alarm_uid,),
    )
    if existing_ticket:
        await db.execute(
            """UPDATE tickets
               SET short_id=%s,
                   ticket_uid=%s,
                   lnms_node_id=%s,
                   device_name=%s,
                   title=%s,
                   severity=%s,
                   status='OPEN',
                   sla_minutes=%s,
                   description=%s,
                   updated_at=NOW()
               WHERE id=%s""",
            (short_id, ticket_uid, node_id, device_name, title, severity, sla, description, existing_ticket["id"]),
        )
    else:
        await db.execute(
            """INSERT INTO tickets
               (short_id, ticket_uid, alarm_uid, lnms_node_id, device_name,
                title, severity, status, sla_minutes, description, created_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,'OPEN',%s,%s,NOW(),NOW())""",
            (short_id, ticket_uid, alarm_uid, node_id, device_name, title, severity, sla, description),
        )

    record_sync_event(
        "inbound",
        "ticket_upserted",
        node=node_id,
        ticket_id=ticket_uid,
        alarm_uid=alarm_uid,
        title=title,
        severity=severity,
        status="OPEN",
    )

    await db.execute(
        "INSERT INTO audit_log (user_name,action,entity_type,entity_id) VALUES (%s,%s,%s,%s)",
        (node_id, f"Webhook alarm: {alarm_uid}", "alarm", alarm_uid),
    )
    log.info(f"[Webhook] Alarm {alarm_uid} → ticket created")


async def _handle_alarm_resolved(payload: dict, node_id: str):
    alarm_uid = payload.get("alarm_uid") or payload.get("alarm_id")
    if not alarm_uid:
        return
    await db.execute(
        "UPDATE alarms SET status='Resolved', resolved_at=NOW() WHERE alarm_uid=%s",
        (alarm_uid,),
    )
    await db.execute(
        "UPDATE tickets SET status='CLOSED', updated_at=NOW() WHERE alarm_uid=%s AND status != 'CLOSED'",
        (alarm_uid,),
    )
    log.info(f"[Webhook] Alarm {alarm_uid} resolved")


async def _handle_device(payload: dict, node_id: str):
    hostname    = payload.get("hostname") or payload.get("host") or payload.get("device_name", "")
    ip_address  = payload.get("ip_address") or payload.get("ip", "")
    device_type = payload.get("device_type") or payload.get("type", "Other")
    location    = payload.get("location", "")
    status      = (payload.get("status") or "ACTIVE").upper()

    await db.execute(
        """INSERT INTO devices (lnms_node_id, hostname, ip_address, device_type, location, status)
           VALUES (%s,%s,%s,%s,%s,%s)
           ON DUPLICATE KEY UPDATE
             ip_address=VALUES(ip_address), device_type=VALUES(device_type),
             location=VALUES(location), status=VALUES(status)""",
        (node_id, hostname, ip_address, device_type, location, status),
    )


async def _handle_device_sync(payload: dict, node_id: str):
    devices = payload.get("devices", [])
    for d in devices:
        await _handle_device(d, node_id)
    log.info(f"[Webhook] Synced {len(devices)} devices from {node_id}")


async def _handle_heartbeat(payload: dict, node_id: str):
    await db.execute(
        "UPDATE lnms_nodes SET last_seen=NOW(), status='CONNECTED' WHERE node_id=%s",
        (node_id,),
    )


# ── Helpers ──────────────────────────────────────────────────

async def _upsert_node(node_id: str, ip: str):
    await db.execute(
        """INSERT INTO lnms_nodes
           (node_id, display_name, ip_address, port, location, status, tcp_live, last_seen)
           VALUES (%s,%s,%s,%s,%s,'CONNECTED',1,NOW())
           ON DUPLICATE KEY UPDATE status='CONNECTED', tcp_live=1, last_seen=NOW()""",
        (node_id, f"Company LNMS ({ip})", ip, 8000, "Remote"),
    )


async def _log_sync(node_id: str, msg_type: str):
    try:
        await db.execute(
            "INSERT INTO tcp_sync_log (lnms_node_id, direction, msg_type, status) VALUES (%s,'INBOUND',%s,'SUCCESS')",
            (node_id, msg_type),
        )
    except Exception:
        pass


def _normalize_severity(raw: str) -> str:
    raw = str(raw).lower()
    if "critical" in raw or raw == "5": return "Critical"
    if "major"    in raw or raw == "4": return "Major"
    if "minor"    in raw or raw == "3": return "Minor"
    if "warning"  in raw or raw in ("2", "warn"): return "Warning"
    return "Info"
