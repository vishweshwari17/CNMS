import asyncio
import json

class LNMSTCPClient:

    RECONNECT_DELAY = 10
    READ_TIMEOUT = 120

    def __init__(self, host, port, node_id):
        self.host = host
        self.port = 7776
        self.node_id = node_id
        self.reader = None
        self.writer = None
        self.connected = False

    async def connect(self):
        while True:
            try:
                print(f"[LNMS] Connecting to CNMS {self.host}:{self.port}")
                self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
                self.connected = True
                print("[LNMS] Connected to CNMS")
                return
            except Exception as e:
                print("[LNMS] Connection failed:", e)
                await asyncio.sleep(self.RECONNECT_DELAY)

    async def send_message(self, payload: dict):
        try:
            if not self.connected:
                await self.connect()

            msg = json.dumps(payload) + "\n"
            self.writer.write(msg.encode())
            await self.writer.drain()

            print("[LNMS] Sent:", payload)
            return True

        except Exception as e:
            print("[LNMS] Send failed:", e)
            self.connected = False
            return False