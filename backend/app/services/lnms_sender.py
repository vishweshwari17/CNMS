import httpx

LNMS_URL = "http://localhost:8000/cnms/update-ticket"


async def send_update_to_lnms(ticket_id, data):
    payload = {
        "ticket_id": ticket_id,
        "status": data.get("status"),
        "resolved_at": str(data.get("resolved_at")) if data.get("resolved_at") else None,
        "resolved_note": data.get("resolved_note"),
        "comments": data.get("comments", [])
    }

    try:
        async with httpx.AsyncClient() as client:
            await client.post(LNMS_URL, json=payload)
    except Exception as e:
        print("❌ LNMS Sync Failed:", e)