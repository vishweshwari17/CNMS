import httpx

LNMS_WEBHOOK_URL = "http://<LNMS_IP>:8000/webhook/cnms-update"


async def send_to_lnms(payload: dict):
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            await client.post(LNMS_WEBHOOK_URL, json=payload)
        except Exception as e:
            print("LNMS sync failed:", e)