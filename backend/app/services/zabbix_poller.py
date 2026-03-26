# app/services/zabbix_poller.py
"""
Zabbix → CNMS Poller

Polls Zabbix API every 30 seconds for:
  - Active problems (→ alarms + tickets)
  - Hosts (→ devices)

Set env vars:
  ZABBIX_URL      = http://localhost:8000   (your local Zabbix)
  ZABBIX_USER     = Admin
  ZABBIX_PASSWORD = zabbix
  ZABBIX_NODE_ID  = LNMS-ZBX-01            (how it appears in CNMS)
"""

import asyncio
import logging
import os
import time
from typing import Optional

import aiohttp

from app.models import db
from app.services.ticket_id import generate_ticket_id
from app.services.ws_manager import WebSocketManager

log = logging.getLogger("cnms.zabbix")

ZABBIX_URL      = os.getenv("ZABBIX_URL",      "http://localhost:8000")
ZABBIX_USER     = os.getenv("ZABBIX_USER",     "Admin")
ZABBIX_PASSWORD = os.getenv("ZABBIX_PASSWORD", "zabbix")
ZABBIX_NODE_ID  = os.getenv("ZABBIX_NODE_ID",  "LNMS-ZBX-01")
POLL_INTERVAL   = int(os.getenv("ZABBIX_POLL_INTERVAL", "30"))

ws_manager: Optional[WebSocketManager] = None

SEV_MAP = {
    0: "Info",
    1: "Info",
    2: "Warning",
    3: "Minor",
    4: "Major",
    5: "Critical",
}
SLA_MAP = {
    "Critical": 60,
    "Major":    240,
    "Minor":    480,
    "Warning":  1440,
    "Info":     2880,
}


class ZabbixPoller:
    def __init__(self):
        self._auth_token: Optional[str] = None
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        self._running = True
        self._task = asyncio.create_task(self._poll_loop())
        log.info(f"[Zabbix] Poller started → {ZABBIX_URL} as {ZABBIX_NODE_ID}")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()

    # ── Main poll loop ───────────────────────────────────────
    async def _poll_loop(self):
        while self._running:
            try:
                await self._ensure_auth()
                await self._sync_devices()
                await self._sync_problems()
                await self._mark_node_connected()
            except Exception as e:
                log.error(f"[Zabbix] Poll cycle failed: {e}")
                self._auth_token = None  # force re-auth next cycle
            await asyncio.sleep(POLL_INTERVAL)

    # ── Zabbix API auth ──────────────────────────────────────
    async def _ensure_auth(self):
        if self._auth_token:
            return
        result = await self._api("user.login", {
            "username": ZABBIX_USER,
            "password": ZABBIX_PASSWORD,
        })
        # Zabbix <5.4 uses "user" key, >=5.4 uses "username"
        if not result:
            result = await self._api("user.login", {
                "user":     ZABBIX_USER,
                "password": ZABBIX_PASSWORD,
            })
        self._auth_token = result
        log.info(f"[Zabbix] Authenticated ✓")

    async def _api(self, method: str, params: dict) -> any:
        payload = {
            "jsonrpc": "2.0",
            "method":  method,
            "params":  params,
            "id":      1,
        }
        if self._auth_token and method != "user.login":
            payload["auth"] = self._auth_token

        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{ZABBIX_URL}/api_jsonrpc.php",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json(content_type=None)
                if "error" in data:
                    raise Exception(f"Zabbix API error: {data['error']}")
                return data.get("result")

    # ── Sync hosts → devices ─────────────────────────────────
    async def _sync_devices(self):
        hosts = await self._api("host.get", {
            "output":       ["hostid", "host", "name", "status"],
            "selectInterfaces": ["ip", "type"],
            "selectGroups": ["name"],
        })
        if not hosts:
            return

        for h in hosts:
            hostname    = h.get("host") or h.get("name", "unknown")
            ip_address  = ""
            ifaces      = h.get("interfaces", [])
            if ifaces:
                ip_address = ifaces[0].get("ip", "")

            groups      = [g["name"] for g in h.get("groups", [])]
            device_type = _guess_device_type(groups)
            status      = "ACTIVE" if h.get("status") == "0" else "INACTIVE"

            await db.execute(
                """INSERT INTO devices
                   (lnms_node_id, hostname, ip_address, device_type, location, status)
                   VALUES (%s,%s,%s,%s,%s,%s)
                   ON DUPLICATE KEY UPDATE
                     ip_address=VALUES(ip_address),
                     device_type=VALUES(device_type),
                     status=VALUES(status)""",
                (ZABBIX_NODE_ID, hostname, ip_address, device_type, "", status),
            )
        log.info(f"[Zabbix] Synced {len(hosts)} devices")

    # ── Sync problems → alarms + tickets ─────────────────────
    async def _sync_problems(self):
        problems = await self._api("problem.get", {
            "output":       ["eventid", "name", "severity", "clock", "acknowledged"],
            "selectHosts":  ["host", "name"],
            "recent":       True,
            "sortfield":    "clock",
            "sortorder":    "DESC",
            "limit":        200,
        })
        if not problems:
            return

        active_uids = set()

        for p in problems:
            alarm_uid   = f"ZBX-{p['eventid']}"
            severity    = SEV_MAP.get(int(p.get("severity", 0)), "Info")
            hosts       = p.get("hosts", [{}])
            device_name = hosts[0].get("host") or hosts[0].get("name", "unknown") if hosts else "unknown"
            alarm_type  = p.get("name", "Unknown Problem")
            raised_at   = _ts(p.get("clock"))

            active_uids.add(alarm_uid)

            # Upsert alarm
            await db.execute(
                """INSERT INTO alarms
                   (alarm_uid, lnms_node_id, device_name, alarm_type, severity, status, raised_at)
                   VALUES (%s,%s,%s,%s,%s,'Active',%s)
                   ON DUPLICATE KEY UPDATE
                     severity=VALUES(severity),
                     alarm_type=VALUES(alarm_type),
                     status='Active'""",
                (alarm_uid, ZABBIX_NODE_ID, device_name, alarm_type, severity, raised_at),
            )

            # Auto-create ticket if not exists
            ticket_uid = generate_ticket_id(created_at=raised_at)
            short_id   = ticket_uid
            title      = f"{alarm_type} on {device_name}"
            sla        = SLA_MAP.get(severity, 480)

            await db.execute(
                """INSERT IGNORE INTO tickets
                   (short_id, ticket_uid, alarm_uid, lnms_node_id, device_name,
                    title, severity, status, sla_minutes, created_at, updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'OPEN',%s,NOW(),NOW())""",
                (short_id, ticket_uid, alarm_uid, ZABBIX_NODE_ID,
                 device_name, title, severity, sla),
            )

            # Log to tcp_sync_log (reuse for audit trail)
            await db.execute(
                """INSERT INTO tcp_sync_log (lnms_node_id, direction, msg_type, status)
                   VALUES (%s,'INBOUND','ALARM_NEW','SUCCESS')""",
                (ZABBIX_NODE_ID,),
            )

        # Resolve alarms no longer in active problems
        await db.execute(
            """UPDATE alarms
               SET status='Resolved', resolved_at=NOW()
               WHERE lnms_node_id=%s AND status='Active'
               AND alarm_uid NOT IN ({})""".format(
                ",".join(["%s"] * len(active_uids)) if active_uids else "''"
            ),
            (ZABBIX_NODE_ID, *active_uids) if active_uids else (ZABBIX_NODE_ID,),
        )

        log.info(f"[Zabbix] Synced {len(problems)} problems")

        if ws_manager:
            await ws_manager.broadcast({"event": "ALARM_SYNC", "node": ZABBIX_NODE_ID, "count": len(problems)})

    async def _mark_node_connected(self):
        await db.execute(
            """INSERT INTO lnms_nodes
               (node_id, display_name, ip_address, port, location, status, tcp_live, last_seen)
               VALUES (%s,%s,%s,%s,%s,'CONNECTED',1,NOW())
               ON DUPLICATE KEY UPDATE status='CONNECTED', tcp_live=1, last_seen=NOW()""",
            (ZABBIX_NODE_ID, f"Zabbix @ {ZABBIX_URL}", ZABBIX_URL.split("//")[-1].split(":")[0], 8000, "Local"),
        )


# ── Helpers ──────────────────────────────────────────────────
def _ts(clock) -> str:
    if not clock:
        return "NOW()"
    from datetime import datetime
    return datetime.utcfromtimestamp(int(clock)).strftime("%Y-%m-%d %H:%M:%S")


def _guess_device_type(groups: list) -> str:
    joined = " ".join(groups).lower()
    if "router"   in joined: return "Router"
    if "switch"   in joined: return "Switch"
    if "firewall" in joined: return "Firewall"
    if "server"   in joined: return "Server"
    if "wireless" in joined or "ap" in joined: return "AP"
    return "Other"
