USE alarm_ticket_sync;

-- =====================================================
-- DATA CLEANUP SCRIPTS
-- =====================================================

-- 1. Remove orphan tickets (tickets with invalid/missing alarm_id)
DELETE FROM TICKETS 
WHERE alarm_id IS NULL 
   OR alarm_id NOT IN (SELECT alarm_id FROM ALARMS);

-- 2. Remove duplicate tickets (keep latest per alarm_id)
DELETE t1 FROM TICKETS t1
INNER JOIN TICKETS t2
WHERE t1.alarm_id = t2.alarm_id
  AND t1.ticket_id < t2.ticket_id;

-- 3. Fix orphan alarms (alarm marked ticket_created=1 but no ticket exists)
UPDATE ALARMS 
SET ticket_created = 0
WHERE ticket_created = 1 
  AND alarm_id NOT IN (SELECT alarm_id FROM TICKETS);

-- 4. Reset stuck pending syncs older than 1 hour
UPDATE TICKETS 
SET sync_status = 'failed'
WHERE sync_status = 'pending'
  AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- 5. Remove tickets with empty/invalid alarm_id
DELETE FROM TICKETS 
WHERE alarm_id = '' 
   OR alarm_id LIKE '%undefined%'
   OR alarm_id LIKE '%null%';

-- 6. Clean up old sync logs (older than 30 days)
DELETE FROM SYNC_LOG 
WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND status IN ('success');

-- 7. Reset resolved_by for closed tickets if different from expected
UPDATE ALARMS a
JOIN TICKETS t ON a.alarm_id = t.alarm_id
SET a.resolved_by = t.resolved_by
WHERE a.status = 'CLOSED'
  AND t.resolved_by IS NOT NULL
  AND a.resolved_by IS NULL;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check for orphan tickets
SELECT 'Orphan Tickets' as check_type, COUNT(*) as count
FROM TICKETS t
LEFT JOIN ALARMS a ON t.alarm_id = a.alarm_id
WHERE a.alarm_id IS NULL;

-- Check for duplicate alarm_id in tickets
SELECT 'Duplicate Tickets' as check_type, COUNT(DISTINCT alarm_id) as duplicate_count
FROM TICKETS
GROUP BY alarm_id
HAVING COUNT(*) > 1;

-- Check for stuck pending syncs
SELECT 'Stuck Pending Syncs' as check_type, COUNT(*) as count
FROM TICKETS
WHERE sync_status = 'pending'
  AND updated_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- Check for mismatched alarm/ticket status
SELECT 'Mismatched Status' as check_type, COUNT(*) as count
FROM TICKETS t
JOIN ALARMS a ON t.alarm_id = a.alarm_id
WHERE t.status = 'CLOSED' AND a.status != 'CLOSED';

-- Overall data integrity check
SELECT 
    (SELECT COUNT(*) FROM ALARMS) as total_alarms,
    (SELECT COUNT(*) FROM TICKETS) as total_tickets,
    (SELECT COUNT(*) FROM TICKETS WHERE alarm_id IS NULL) as orphan_tickets,
    (SELECT COUNT(*) FROM ALARMS WHERE ticket_created = 1 AND alarm_id NOT IN (SELECT alarm_id FROM TICKETS)) as stuck_alarms,
    (SELECT COUNT(*) FROM SYNC_LOG WHERE status = 'failed') as failed_syncs;
