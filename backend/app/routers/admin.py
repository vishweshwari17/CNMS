# app/routers/admin.py
"""
GET /tcp-log?limit=50
GET /audit?limit=100

TCP log frontend reads:
  l.id, l.lnms_node_id, l.direction, l.msg_type, l.status, l.created_at

Audit log frontend reads:
  log.log_id, log.user_name, log.action,
  log.entity_type, log.entity_id, log.created_at
"""
from fastapi import APIRouter, Query
from typing import List, Optional
from app.models import db
from app.schemas import TcpLogEntry, AuditLogEntry

router = APIRouter(tags=["Admin"])


@router.get("/tcp-log", response_model=List[TcpLogEntry])
async def get_tcp_log(
    limit:     int = Query(50, ge=1, le=500),
    direction: Optional[str] = Query(None),
    status:    Optional[str] = Query(None),
):
    where, args = ["1=1"], []
    if direction:
        where.append("direction=%s"); args.append(direction)
    if status:
        where.append("status=%s"); args.append(status)
    args.append(limit)

    sql = f"""
        SELECT id, lnms_node_id, direction, msg_type, status, created_at
        FROM   tcp_sync_log
        WHERE  {' AND '.join(where)}
        ORDER  BY created_at DESC
        LIMIT  %s
    """
    return await db.fetchall(sql, tuple(args))


@router.get("/audit", response_model=List[AuditLogEntry])
async def get_audit_logs(limit: int = Query(100, ge=1, le=1000)):
    return await db.fetchall(
        """SELECT log_id, user_name, action, entity_type, entity_id, created_at
           FROM   audit_log
           ORDER  BY created_at DESC
           LIMIT  %s""",
        (limit,)
    )