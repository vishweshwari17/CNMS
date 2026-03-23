# app/routers/dashboard.py
"""
GET /dashboard/stats

Frontend reads:
  stats.tickets            → {Open, ACK, Closed}
  stats.alarms             → {Active, Resolved}
  stats.alarms_by_severity → {Critical, Major, Minor, Warning, Info}
  stats.tickets_by_lnms    → {"LNMS-MUM-01": 4, ...}
  stats.tcp_messages_today → int
"""
from fastapi import APIRouter
from app.models import db
from app.schemas import DashboardStats

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/stats", response_model=DashboardStats)
async def dashboard_stats():
    # Ticket counts — seed all statuses at 0 so Pydantic never sees missing keys
    tickets: dict = {"Open": 0, "ACK": 0, "Closed": 0}
    for r in await db.fetchall("SELECT status, COUNT(*) AS c FROM tickets GROUP BY status"):
        tickets[r["status"]] = r["c"]

    # Alarm counts
    alarms: dict = {"Active": 0, "Resolved": 0}
    for r in await db.fetchall("SELECT status, COUNT(*) AS c FROM alarms GROUP BY status"):
        alarms[r["status"]] = r["c"]

    # Active alarms by severity
    alarms_by_severity: dict = {
        "Critical": 0, "Major": 0, "Minor": 0, "Warning": 0, "Info": 0
    }
    for r in await db.fetchall(
        "SELECT severity, COUNT(*) AS c FROM alarms WHERE status='Active' GROUP BY severity"
    ):
        alarms_by_severity[r["severity"]] = r["c"]

    # Tickets grouped by LNMS node
    tickets_by_lnms: dict = {}
    for r in await db.fetchall(
        "SELECT lnms_node_id, COUNT(*) AS c FROM tickets GROUP BY lnms_node_id"
    ):
        tickets_by_lnms[r["lnms_node_id"]] = r["c"]

    # TCP messages sent today
    tcp_row = await db.fetchone(
        "SELECT COUNT(*) AS c FROM tcp_sync_log WHERE DATE(created_at) = CURDATE()"
    )
    tcp_today = tcp_row["c"] if tcp_row else 0

    return DashboardStats(
        tickets=tickets,
        alarms=alarms,
        alarms_by_severity=alarms_by_severity,
        tickets_by_lnms=tickets_by_lnms,
        tcp_messages_today=tcp_today,
    )