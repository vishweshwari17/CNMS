from typing import Optional
from fastapi import APIRouter, Query
from app.models import db
from app.schemas import Device

router = APIRouter(tags=["Devices"])

@router.get("/devices")
async def get_devices(
    search: Optional[str] = Query(None),
    device_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    lnms_node_id: Optional[str] = Query(None),
):
    where, args = ["1=1"], []

    if search:
        where.append("(hostname LIKE %s OR ip_address LIKE %s)")
        args += [f"%{search}%", f"%{search}%"]

    if device_type:
        where.append("device_type=%s")
        args.append(device_type)

    if status:
        where.append("status=%s")
        args.append(status)

    if lnms_node_id:
        where.append("lnms_node_id=%s")
        args.append(lnms_node_id)

    sql = f"""
        SELECT id, lnms_node_id, hostname, ip_address, device_type, location, status
        FROM devices
        WHERE {' AND '.join(where)}
        ORDER BY hostname
        LIMIT 500
    """
    rows = await db.fetchall(sql, tuple(args))
    return {"data": rows}  # frontend expects {data: [...]}