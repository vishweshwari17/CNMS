# app/main.py

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.models import db as database
from app.services.ws_manager import WebSocketManager
from app.services import dual_lnms_sync as sync_module
from app.routers import nodes, alarms, devices, tickets, dashboard, admin, webhook
import app.routers.webhook as webhook_mod

# ✅ TCP CLIENT (correct import - no circular)
from app.tcp_manager import tcp_client

import asyncio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
log = logging.getLogger("cnms.main")

ws_manager = WebSocketManager()
poller = sync_module.DualLNMSPoller()


# ===============================
# 🚀 APP LIFECYCLE
# ===============================
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting CNMS backend...")

    await database.init_pool()
    log.info("[DB] Pool ready")

    # Attach WS manager to modules
    sync_module.ws_manager = ws_manager
    webhook_mod.ws_manager = ws_manager

    # Start LNMS sync poller
    poller.start()
    log.info("[DualPoller] Both LNMS sync started")

    # ✅ Start TCP client (important)
    asyncio.create_task(tcp_client.connect())
    log.info("[TCP] Client started")

    yield

    log.info("Shutting down...")
    await poller.stop()
    await database.close_pool()


# ===============================
# 🚀 FASTAPI INIT
# ===============================
app = FastAPI(
    title="CNMS API",
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=True
)


# ===============================
# 🌐 CORS
# ===============================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://127.0.0.1:3000",
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://192.78.10.111:8000", "http://192.78.10.111",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ===============================
# 📦 ROUTERS
# ===============================
app.include_router(nodes.router)
app.include_router(alarms.router)
app.include_router(devices.router)
app.include_router(tickets.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(webhook.router)


# ===============================
# 🔌 WEBSOCKET (REAL-TIME UI)
# ===============================
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


# ===============================
# ❤️ HEALTH CHECK
# ===============================
@app.get("/health")
async def health():
    nodes_rows = await database.fetchall(
        "SELECT node_id, display_name, ip_address, status, tcp_live, last_seen FROM lnms_nodes"
    )
    counts = await database.fetchone(
        "SELECT COUNT(*) as alarms FROM alarms WHERE status='ACTIVE'"
    )
    tickets_open = await database.fetchone(
        "SELECT COUNT(*) as tickets FROM tickets WHERE status='OPEN'"
    )

    return {
        "status": "ok",
        "lnms_nodes": nodes_rows,
        "active_alarms": counts["alarms"] if counts else 0,
        "open_tickets": tickets_open["tickets"] if tickets_open else 0,
        "ws_clients": len(ws_manager._connections),
    }