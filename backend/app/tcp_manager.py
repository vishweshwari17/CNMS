# app/tcp_manager.py

import asyncio
import json
import logging

log = logging.getLogger("tcp_client")


class LNMSTCPClient:
    def __init__(self, host: str, port: int, node_id: str):
        self.host = host
        self.port = port
        self.node_id = node_id

        self.reader = None
        self.writer = None

        self.RECONNECT_DELAY = 5
        self.connected = False

    # ===============================
    # CONNECT TO CNMS
    # ===============================
    async def connect(self):
        while True:
            try:
                log.info(f"[TCP] Connecting to CNMS {self.host}:{self.port}...")

                self.reader, self.writer = await asyncio.open_connection(
                    self.host, self.port
                )

                self.connected = True
                log.info("[TCP] Connected to CNMS ✅")

                # Start listening
                asyncio.create_task(self.listen())

                break

            except Exception as e:
                log.error(f"[TCP] Connection failed: {e}")
                self.connected = False
                await asyncio.sleep(self.RECONNECT_DELAY)

    # ===============================
    # SEND MESSAGE TO CNMS
    # ===============================
    async def send_message(self, data: dict):
        if not self.writer:
            log.warning("[TCP] Not connected. Cannot send message")
            return

        try:
            message = json.dumps(data) + "\n"
            self.writer.write(message.encode())
            await self.writer.drain()

            log.info(f"[TCP] Sent: {data}")

        except Exception as e:
            log.error(f"[TCP] Send failed: {e}")
            self.connected = False

    # ===============================
    # LISTEN FROM CNMS
    # ===============================
    async def listen(self):
        from app.database import get_db
        from app.models import Ticket

        while True:
            try:
                data = await self.reader.readline()

                if not data:
                    raise ConnectionError("Disconnected")

                message = json.loads(data.decode().strip())
                log.info(f"[TCP] Received: {message}")

                # ===============================
                # HANDLE RESPONSE FROM CNMS
                # ===============================
                if message.get("msg_type") == "TICKET_UPDATE":

                    ticket_id = message.get("ticket_id")
                    status = message.get("status")
                    resolved_at = message.get("resolved_at")
                    note = message.get("resolution_note")

                    db = next(get_db())

                    ticket = db.query(Ticket).filter(
                        Ticket.ticket_id == ticket_id
                    ).first()

                    if ticket:
                        ticket.status = status

                        if status == "ACK":
                            ticket.acknowledged_at = resolved_at

                        if status == "Resolved":
                            ticket.resolved_at = resolved_at

                        if status == "Closed":
                            ticket.closed_at = resolved_at

                        ticket.resolution_note = note

                        db.commit()

                        log.info(f"[TCP] Ticket updated: {ticket_id}")

                        # ✅ REAL-TIME UI PUSH
                        from app.services.ws_manager import ws_manager

                        await ws_manager.broadcast({
                            "type": "TICKET_UPDATE",
                            "ticket_id": ticket_id,
                            "status": status,
                            "resolved_at": resolved_at,
                            "note": note
                        })

            except Exception as e:
                log.error(f"[TCP] Listen error: {e}")
                self.connected = False
                await asyncio.sleep(self.RECONNECT_DELAY)
                await self.connect()
                break


# ===============================
# CREATE GLOBAL CLIENT INSTANCE
# ===============================
tcp_client = LNMSTCPClient(
    host="127.0.0.1",   # CNMS IP
    port=7776,          # CNMS TCP port
    node_id="LNMS1"
)