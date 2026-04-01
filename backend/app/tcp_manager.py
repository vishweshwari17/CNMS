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
        from app.models import db

        while True:
            try:
                data = await self.reader.readline()

                if not data:
                    raise ConnectionError("Disconnected")

                decoded_data = data.decode().strip()
                if not decoded_data:
                    continue  # Ignore empty keep-alive lines

                try:
                    message = json.loads(decoded_data)
                    log.info(f"[TCP] Received: {message}")
                except json.JSONDecodeError:
                    log.warning(f"[TCP] Ignored non-JSON payload: {decoded_data}")
                    continue

                # ===============================
                # HANDLE RESPONSE FROM CNMS
                # ===============================
                if message.get("msg_type") == "TICKET_UPDATE":

                    ticket_id = message.get("ticket_id")
                    status = message.get("status")
                    resolved_at = message.get("resolved_at")
                    note = message.get("resolution_note")

                    ticket = await db.fetchone(
                        "SELECT id FROM tickets WHERE ticket_uid=%s OR CAST(id AS CHAR)=%s OR short_id=%s LIMIT 1",
                        (ticket_id, ticket_id, ticket_id)
                    )

                    if ticket:
                        # Normalize status to match MariaDB Enum where possible
                        if status == 'Closed' or status == 'Resolved':
                            norm_status = 'CLOSED'
                            alarm_status = "'RESOLVED'"
                        else:
                            norm_status = status.upper() if status else 'OPEN'
                            alarm_status = "'ACTIVE'"
                            
                        query = f"""
                            UPDATE tickets 
                            SET 
                                status=%s, 
                                resolution_note=%s, 
                                resolved_at=COALESCE(%s, resolved_at),
                                updated_at=NOW(),
                                alarm_status={alarm_status},
                                last_alarm_update=NOW()
                            WHERE id=%s
                        """
                        await db.execute(query, (norm_status, note, resolved_at, ticket["id"]))

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