# app/routers/alarms.py
"""
GET /alarms?status=&lnms_node_id=&severity=
Frontend reads: id, alarm_uid, lnms_node_id, device_name,
                alarm_type, severity, status, raised_at
"""
from typing import List, Optional
from fastapi import APIRouter, Query
from app.models import db
from app.schemas import Alarm

router = APIRouter(tags=["Alarms"])


@router.get("/alarms", response_model=List[Alarm])
async def get_alarms(
    status:       Optional[str] = Query(None),
    lnms_node_id: Optional[str] = Query(None),
    severity:     Optional[str] = Query(None),
):
    where, args = ["1=1"], []
    if status:
        where.append("status=%s"); args.append(status)
    if lnms_node_id:
        where.append("lnms_node_id=%s"); args.append(lnms_node_id)
    if severity:
        where.append("severity=%s"); args.append(severity)

    sql = f"""
        SELECT id, alarm_uid, lnms_node_id, device_name, alarm_type,
               severity, status, raised_at, resolved_at
        FROM   alarms
        WHERE  {' AND '.join(where)}
        ORDER  BY raised_at DESC
        LIMIT  500
    """
    return await db.fetchall(sql, tuple(args))