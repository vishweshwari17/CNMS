

# app/services/dual_lnms_sync.py
"""
Dual LNMS Sync Service
======================
- LNMS-1 (Local)   : reads lnms_db directly via Unix socket (same server)
- LNMS-2 (Company) : SSH into 192.78.10.111 → mysqldump → import into
                     cnms_db.company_mirror_alarms + company_mirror_tickets
                     → then syncs into cnms_db.alarms + tickets

No files modified on either LNMS server.
"""
import asyncio
import logging
import os
import subprocess
import tempfile
from datetime import datetime
from typing import Optional

import aiomysql

from app.models import db as database
from app.services.ticket_id import external_ticket_id, generate_ticket_id

log = logging.getLogger("cnms.dual_sync")

# ── Config ────────────────────────────────────────────────────────────────────
LOCAL_LNMS = {
    "node_id":   "LNMS-LOCAL-01",
    "label":     "Local LNMS",
    "unix_socket": "/var/lib/mysql/mysql.sock",
    "user":      os.getenv("LOCAL_LNMS_USER",   "lnms_user"),
    "password":  os.getenv("LOCAL_LNMS_PASS",   "user_123"),
    "db":        os.getenv("LOCAL_LNMS_DB",     "lnms_db"),
}

COMPANY_LNMS = {
    "node_id":   "LNMS-COMPANY-01",
    "label":     "Company LNMS",
    "ssh_host":  os.getenv("COMPANY_SSH_HOST",  "192.78.10.111"),
    "ssh_user":  os.getenv("COMPANY_SSH_USER",  "nms"),          # update if different
    "ssh_key":   os.getenv("COMPANY_SSH_KEY",   "/home/nms/.ssh/cnms_id_rsa"),
    "db_user":   os.getenv("COMPANY_DB_USER", "cnms_reader"),
    "db_pass":   os.getenv("COMPANY_DB_PASS", "cnms1234"),
    "db_name":   os.getenv("COMPANY_DB_NAME", "snmp_monitor"),
}

POLL_INTERVAL = int(os.getenv("LNMS_POLL_INTERVAL", "60"))

ws_manager = None  # injected by main.py

# ── Severity normaliser ───────────────────────────────────────────────────────
SEV_MAP = {
    "critical": "Critical", "high": "Critical",
    "major":    "Major",
    "minor":    "Minor",    "low":  "Minor",
    "warning":  "Warning",  "warn": "Warning",
    "info":     "Info",     "ok":   "Info",
}

def norm_sev(raw: str) -> str:
    return SEV_MAP.get((raw or "").lower().strip(), "Warning")

# ── CNMS node registration ────────────────────────────────────────────────────
async def _register_node(node_id: str, label: str, ip: str, status: str):
    await database.execute(
        """INSERT INTO lnms_nodes
           (node_id, display_name, ip_address, port, location, status, tcp_live, last_seen)
           VALUES (%s,%s,%s,0,%s,%s,%s,NOW())
           ON DUPLICATE KEY UPDATE
             display_name=VALUES(display_name),
             status=VALUES(status),
             tcp_live=VALUES(tcp_live),
             last_seen=NOW()""",
        (node_id, label, ip, label, status, 1 if status == "CONNECTED" else 0),
    )

# ── Ticket creator ────────────────────────────────────────────────────────────
async def _ensure_ticket(node_id: str, alarm_uid: str, device: str,
                          host: str, ip: str, aname: str, severity: str, desc: str, alarm_source: str):
    exists = await database.fetchone(
        "SELECT id FROM tickets WHERE alarm_uid=%s", (alarm_uid,)
    )
    if exists:
        return

    ticket_uid = generate_ticket_id(created_at=datetime.utcnow())
    short_id = ticket_uid
    await database.execute(
        """INSERT INTO tickets
           (short_id, ticket_uid, alarm_uid, lnms_node_id, device_name, title,
            severity, status, sla_minutes, description, created_at, updated_at,
            alarm_status, alarm_source, last_alarm_update)
           VALUES (%s,%s,%s,%s,%s,%s,%s,'OPEN',240,%s,NOW(),NOW(),'ACTIVE',%s,NOW())""",
        (short_id, ticket_uid, alarm_uid, node_id, device or host,
         f"[{severity}] {aname} on {device or host}", severity, desc or "", alarm_source),
    )
    log.info(f"[SYNC] Ticket created: {short_id} ← {alarm_uid}")
    if ws_manager:
        await ws_manager.broadcast({
            "type":      "TICKET_NEW",
            "node_id":   node_id,
            "alarm_uid": alarm_uid,
            "device":    device or host,
            "severity":  severity,
        })

# ── Alarm upsert ─────────────────────────────────────────────────────────────
async def _upsert_alarm(node_id: str, alarm_uid: str, device: str, host: str,
                         ip: str, aname: str, severity: str, desc: str,
                         status: str, raised_at, resolved_at=None, alarm_source: str='LNMS'):
    # Ensure alarm_type is never null
    alarm_type = aname or device or host or "Unknown Alarm"

    existing = await database.fetchone(
        "SELECT id, status FROM alarms WHERE alarm_uid=%s", (alarm_uid,)
    )
    if not existing:
        await database.execute(
            """INSERT INTO alarms
               (alarm_uid, lnms_node_id, device_name, alarm_type,
                severity, status, description, raised_at, resolved_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,COALESCE(%s,NOW()),%s)""",
            (alarm_uid, node_id, device or host or "unknown", alarm_type,
             severity, status, desc or "", raised_at, resolved_at),
        )
        if status == "ACTIVE":
            await _ensure_ticket(node_id, alarm_uid, device, host, ip,
                                  alarm_type, severity, desc, alarm_source)
    else:
        if existing["status"] != status:
            await database.execute(
                """UPDATE alarms SET status=%s, resolved_at=%s
                   WHERE alarm_uid=%s""",
                (status, resolved_at, alarm_uid),
            )
            tkt_status = 'CLOSED' if status == 'RESOLVED' else 'OPEN'
            await database.execute(
                """UPDATE tickets SET status=%s, alarm_status=%s, last_alarm_update=NOW()
                   WHERE alarm_uid=%s AND status != %s""",
                (tkt_status, status, alarm_uid, tkt_status)
            )

# ═══════════════════════════════════════════════════════════════════════════════
# LNMS-1  LOCAL  (Unix socket — same server)
# ═══════════════════════════════════════════════════════════════════════════════
async def sync_local_lnms():
    cfg = LOCAL_LNMS
    try:
        conn = await aiomysql.connect(
            unix_socket = cfg["unix_socket"],
            user        = cfg["user"],
            password    = cfg["password"],
            db          = cfg["db"],
            cursorclass = aiomysql.DictCursor,
            autocommit  = True,
        )
    except Exception as e:
        log.error(f"[LOCAL] Cannot connect to lnms_db: {e}")
        await _register_node(cfg["node_id"], cfg["label"], "localhost", "DISCONNECTED")
        return

    await _register_node(cfg["node_id"], cfg["label"], "localhost", "CONNECTED")
    log.info("[LOCAL] Connected to lnms_db ✓")

    try:
        async with conn.cursor() as cur:
            # ── Alarms ──────────────────────────────────────────────────────
            await cur.execute(
                "SELECT * FROM alarms ORDER BY created_at DESC LIMIT 500"
            )
            alarms = await cur.fetchall()
            for a in alarms:
                uid      = f"LOCAL-ALM-{a['alarm_id']}"
                status   = "ACTIVE" if str(a.get("status","")).lower() in ("active","1") else "RESOLVED"
                severity = norm_sev(a.get("severity",""))
                await _upsert_alarm(
                    node_id     = cfg["node_id"],
                    alarm_uid   = uid,
                    device      = a.get("device_name",""),
                    host        = a.get("host_name",""),
                    ip          = a.get("ip_address",""),
                    aname       = a.get("alarm_name","Alert"),
                    severity    = severity,
                    desc        = a.get("description",""),
                    status      = status,
                    raised_at   = a.get("problem_time") or a.get("created_at"),
                    resolved_at = a.get("resolved_time"),
                    alarm_source= 'LNMS'
                )

            # ── Tickets already in lnms_db → mirror into cnms tickets ───────
            await cur.execute(
                "SELECT * FROM tickets ORDER BY created_at DESC LIMIT 200"
            )
            lnms_tickets = await cur.fetchall()
            for t in lnms_tickets:
                ticket_uid = external_ticket_id(
                    raw_ticket_id=t.get("ticket_id"),
                    created_at=t.get("created_at"),
                    fallback_at=t.get("updated_at"),
                )
                uid      = f"LOCAL-ALM-{t['alarm_id']}" if t.get("alarm_id") else f"LOCAL-TKT-{t['ticket_id']}"
                alarm_uid = uid
                existing = await database.fetchone(
                    "SELECT id FROM tickets WHERE alarm_uid=%s", (alarm_uid,)
                )
                sev = norm_sev(t.get("severity_calculated") or t.get("severity_original",""))
                st_raw = (t.get("status") or "Open").lower()
                st_map = {"open":"OPEN","ack":"ACK","resolved":"RESOLVED",
                          "closed":"CLOSED","reopened":"OPEN"}
                status = st_map.get(st_raw, "OPEN")
                short_id = ticket_uid
                if existing:
                    await database.execute(
                        """UPDATE tickets
                           SET short_id=%s,
                               ticket_uid=%s,
                               lnms_node_id=%s,
                               device_name=%s,
                               title=%s,
                               severity=%s,
                               status=%s,
                               description=%s,
                               updated_at=%s,
                               alarm_status=%s,
                               alarm_source='LNMS',
                               last_alarm_update=NOW()
                           WHERE id=%s""",
                        (short_id, ticket_uid, cfg["node_id"],
                         t.get("device_name",""), t.get("title",""),
                         sev, status, t.get("description",""),
                         t.get("updated_at"), 
                         'RESOLVED' if status in ('CLOSED', 'RESOLVED') else 'ACTIVE', 
                         existing["id"]),
                    )
                else:
                    await database.execute(
                        """INSERT INTO tickets
                           (short_id, ticket_uid, alarm_uid, lnms_node_id, device_name, title,
                            severity, status, sla_minutes, description, created_at, updated_at,
                            alarm_status, alarm_source, last_alarm_update)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,240,%s,%s,%s,%s,'LNMS',NOW())""",
                        (short_id, ticket_uid, alarm_uid, cfg["node_id"],
                         t.get("device_name",""), t.get("title",""),
                         sev, status, t.get("description",""),
                         t.get("created_at"), t.get("updated_at"),
                         'RESOLVED' if status in ('CLOSED', 'RESOLVED') else 'ACTIVE'),
                    )

            log.info(f"[LOCAL] Synced {len(alarms)} alarms, {len(lnms_tickets)} tickets")

        await database.execute(
            "INSERT INTO tcp_sync_log (lnms_node_id,direction,msg_type,status) VALUES (%s,'INBOUND','DB_POLL','SUCCESS')",
            (cfg["node_id"],),
        )
    except Exception as e:
        log.error(f"[LOCAL] Sync error: {e}")
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════════
# LNMS-2  COMPANY  (SSH tunnel → dump → import)
# ═══════════════════════════════════════════════════════════════════════════════
def _ssh_query(cfg: dict, sql: str) -> list:
    """Run a SQL query on company server via SSH, return list of dicts."""
    cmd = [
        "ssh",
        "-i", cfg["ssh_key"],
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        f"{cfg['ssh_user']}@{cfg['ssh_host']}",
        f"mariadb -u{cfg['db_user']} -p{cfg['db_pass']} {cfg['db_name']} -B -N -e \"{sql}\"",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            log.error(f"[COMPANY] SSH query failed: {result.stderr[:200]}")
            return []
        rows = []
        lines = result.stdout.strip().splitlines()
        if not lines:
            return []
        # First line is column headers when not using -N, but we use -N so no headers
        # We pass column names manually per query
        return lines
    except Exception as e:
        log.error(f"[COMPANY] SSH query error: {e}")
        return []


def _ssh_query_dicts(cfg: dict, sql: str, columns: list) -> list:
    """Run SSH query and return list of dicts with given column names."""
    cmd = [
        "ssh",
        "-i", cfg["ssh_key"],
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=10",
        f"{cfg['ssh_user']}@{cfg['ssh_host']}",
        f'mariadb -u{cfg["db_user"]} -p{cfg["db_pass"]} {cfg["db_name"]} -B -e "{sql}"',
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            log.error(f"[COMPANY] Query failed: {result.stderr[:200]}")
            return []
        lines = result.stdout.strip().splitlines()
        if len(lines) < 2:
            return []
        # First line is headers
        headers = lines[0].split("\t")
        rows = []
        for line in lines[1:]:
            vals = line.split("\t")
            row = {}
            for i, h in enumerate(headers):
                row[h] = vals[i] if i < len(vals) else None
            rows.append(row)
        return rows
    except Exception as e:
        log.error(f"[COMPANY] SSH query error: {e}")
        return []


async def sync_company_lnms():
    cfg = COMPANY_LNMS

    # Test connectivity
    test = await asyncio.get_event_loop().run_in_executor(
        None, _ssh_query_dicts, cfg,
        "SELECT COUNT(*) as cnt FROM alarms", ["cnt"]
    )
    if not test:
        await _register_node(cfg["node_id"], cfg["label"], cfg["ssh_host"], "DISCONNECTED")
        return

    await _register_node(cfg["node_id"], cfg["label"], cfg["ssh_host"], "CONNECTED")
    log.info(f"[COMPANY] Connected via SSH ✓  alarms={test[0].get('cnt','?')}")

    # Fetch alarms
    alarms = await asyncio.get_event_loop().run_in_executor(
        None, _ssh_query_dicts, cfg,
        "SELECT alarm_id,host_name,device_name,ip_address,severity,alarm_name,description,problem_time,resolved_time,status FROM alarms ORDER BY alarm_id DESC LIMIT 500",
        []
    )
    for a in alarms:
        uid      = f"COMPANY-ALM-{a.get('alarm_id','')}"
        st_raw   = (a.get("status") or "").lower()
        status   = "RESOLVED" if st_raw in ("resolved","closed","0") else "ACTIVE"
        severity = norm_sev(a.get("severity",""))
        raised   = a.get("problem_time") if a.get("problem_time") not in (None,"NULL","") else None
        resolved = a.get("resolved_time") if a.get("resolved_time") not in (None,"NULL","") else None
        await _upsert_alarm(
            node_id     = cfg["node_id"],
            alarm_uid   = uid,
            device      = a.get("device_name",""),
            host        = a.get("host_name",""),
            ip          = a.get("ip_address",""),
            aname       = a.get("alarm_name","Unknown Alarm"),
            severity    = severity,
            desc        = a.get("description",""),
            status      = status,
            raised_at   = raised,
            resolved_at = resolved,
            alarm_source= 'SPIC-NMS'
        )

    # Fetch tickets
    tickets = await asyncio.get_event_loop().run_in_executor(
        None, _ssh_query_dicts, cfg,
        "SELECT ticket_id,alarm_id,title,device_name,ip_address,severity,status,description,created_at,updated_at FROM tickets ORDER BY created_at DESC LIMIT 200",
        []
    )
    for t in tickets:
        ticket_uid = external_ticket_id(
            raw_ticket_id=t.get("ticket_id"),
            created_at=t.get("created_at"),
            fallback_at=t.get("updated_at"),
        )
        alarm_uid = f"COMPANY-ALM-{t['alarm_id']}" if t.get("alarm_id") and t["alarm_id"] != "NULL" else f"COMPANY-TKT-{t['ticket_id']}"
        existing = await database.fetchone("SELECT id FROM tickets WHERE alarm_uid=%s", (alarm_uid,))
        sev    = norm_sev(t.get("severity_calculated") or t.get("severity_original") or t.get("severity",""))
        st_raw = (t.get("status") or "Open").lower()
        st_map = {"open":"OPEN","ack":"ACK","resolved":"RESOLVED","closed":"CLOSED","reopened":"OPEN"}
        status = st_map.get(st_raw, "OPEN")
        short_id = ticket_uid
        ca = t.get("created_at") if t.get("created_at") not in (None,"NULL","") else None
        ua = t.get("updated_at") if t.get("updated_at") not in (None,"NULL","") else None
        if existing:
            await database.execute(
                """UPDATE tickets
                   SET short_id=%s,
                       ticket_uid=%s,
                       lnms_node_id=%s,
                       device_name=%s,
                       title=%s,
                       severity=%s,
                       status=%s,
                       description=%s,
                       updated_at=%s,
                       alarm_status=%s,
                       alarm_source='SPIC-NMS',
                       last_alarm_update=NOW()
                   WHERE id=%s""",
                (short_id, ticket_uid, cfg["node_id"],
                 t.get("device_name",""), t.get("title",""),
                 sev, status, t.get("description",""), ua, 
                 'RESOLVED' if status in ('CLOSED', 'RESOLVED') else 'ACTIVE', 
                 existing["id"]),
            )
        else:
            await database.execute(
                """INSERT INTO tickets
                   (short_id, ticket_uid, alarm_uid, lnms_node_id, device_name, title,
                    severity, status, sla_minutes, description, created_at, updated_at,
                    alarm_status, alarm_source, last_alarm_update)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,240,%s,%s,%s,%s,'SPIC-NMS',NOW())""",
                (short_id, ticket_uid, alarm_uid, cfg["node_id"],
                 t.get("device_name",""), t.get("title",""),
                 sev, status, t.get("description",""), ca, ua,
                 'RESOLVED' if status in ('CLOSED', 'RESOLVED') else 'ACTIVE'),
            )

    log.info(f"[COMPANY] Synced {len(alarms)} alarms, {len(tickets)} tickets")
    await database.execute(
        "INSERT INTO tcp_sync_log (lnms_node_id,direction,msg_type,status) VALUES (%s,'INBOUND','SSH_QUERY','SUCCESS')",
        (cfg["node_id"],),
    )


class DualLNMSPoller:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None

    def start(self):
        self._task = asyncio.create_task(self._loop())
        log.info(f"[DualPoller] Started — interval {POLL_INTERVAL}s")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while True:
            try:
                log.info("[DualPoller] Sync cycle starting...")
                await asyncio.gather(
                    sync_local_lnms(),
                    sync_company_lnms(),
                    return_exceptions=True,
                )
                log.info("[DualPoller] Sync cycle complete.")
            except Exception as e:
                log.error(f"[DualPoller] Loop error: {e}")
            await asyncio.sleep(POLL_INTERVAL)
