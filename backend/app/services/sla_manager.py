import asyncio
import logging
from app.models import db

log = logging.getLogger("cnms.sla_manager")

class SLAManager:
    def __init__(self):
        self._task = None

    def start(self):
        self._task = asyncio.create_task(self._loop())
        log.info("[SLAManager] Started SLA tracking loop")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        while True:
            try:
                await self.update_slas()
            except Exception as e:
                log.error(f"[SLAManager] Loop error: {e}")
            await asyncio.sleep(60)

    async def update_slas(self):
        # Update SLA Used and SLA Status for all open tickets
        await db.execute("""
            UPDATE tickets
            SET 
                sla_used = COALESCE(TIMESTAMPDIFF(MINUTE, created_at, NOW()), 0),
                sla_status = CASE
                    WHEN COALESCE(TIMESTAMPDIFF(MINUTE, created_at, NOW()), 0) < (COALESCE(sla_limit_minutes, sla_minutes, 60) * 0.8) THEN 'ON_TIME'
                    WHEN COALESCE(TIMESTAMPDIFF(MINUTE, created_at, NOW()), 0) <= COALESCE(sla_limit_minutes, sla_minutes, 60) THEN 'WARNING'
                    ELSE 'BREACHED'
                END
            WHERE status NOT IN ('CLOSED', 'RESOLVED')
        """)
        
        # Identify newly breached tickets and bump priority if not already critical
        breached_tickets = await db.fetchall("""
            SELECT id, short_id, title, severity FROM tickets
            WHERE sla_status = 'BREACHED' AND status NOT IN ('CLOSED', 'RESOLVED')
        """)
        
        for t in breached_tickets:
            if t['severity'] != 'Critical':
                await db.execute("UPDATE tickets SET severity='Critical' WHERE id=%s", (t['id'],))
                log.warning(f"🚨 [SLA BREACHED] Ticket {t['short_id']} ({t['title']}) exceeded SLA. Escalated to Critical priority.")
                
                # Optionally add a conversation message
                await db.execute(
                    "INSERT INTO ticket_conversations (ticket_id, sender, message, created_at) VALUES (%s, 'SYSTEM', 'SLA BREACHED. Escalating to high priority.', NOW())",
                    (t['id'],)
                )

sla_manager = SLAManager()
