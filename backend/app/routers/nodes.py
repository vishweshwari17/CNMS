# app/routers/nodes.py
"""
GET /lnms-nodes
Returns all LNMS nodes with live TCP status injected.
Frontend reads: node_id, display_name, ip_address, port,
                location, status, tcp_live, last_seen
"""
from typing import List
from fastapi import APIRouter
from app.models import db
from app.schemas import LnmsNode

router = APIRouter(tags=["Nodes"])

# Injected by main.py after TCP clients are started
tcp_clients: dict = {}


@router.get("/lnms-nodes", response_model=List[LnmsNode])
async def get_lnms_nodes():
    rows = await db.fetchall(
        "SELECT * FROM lnms_nodes ORDER BY node_id"
    )
    # Overlay live TCP connected flag from in-memory client map
    for r in rows:
        nid = r["node_id"]
        if nid in tcp_clients:
            r["tcp_live"] = tcp_clients[nid].connected
            r["status"]   = "CONNECTED" if tcp_clients[nid].connected else "DISCONNECTED"
    return rows