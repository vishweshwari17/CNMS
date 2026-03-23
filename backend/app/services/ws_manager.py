# app/services/ws_manager.py
import json
import logging
from fastapi import WebSocket

log = logging.getLogger("cnms.ws")


class WebSocketManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.append(ws)
        log.info(f"[WS] Client connected. Total: {len(self._connections)}")

    def disconnect(self, ws: WebSocket):
        if ws in self._connections:
            self._connections.remove(ws)
        log.info(f"[WS] Client disconnected. Total: {len(self._connections)}")

    async def broadcast(self, data: dict):
        msg = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws in list(self._connections):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)