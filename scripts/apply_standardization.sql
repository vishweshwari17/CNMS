-- scripts/apply_standardization.sql
-- CNMS Database Standardization

USE cnms_db;

-- 1. Ensure alarm_id exists in tickets
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
                   WHERE table_schema = 'cnms_db' AND table_name = 'tickets' AND column_name = 'alarm_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE tickets ADD COLUMN alarm_id INT AFTER ticket_uid', 'SELECT "alarm_id already exists"');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Populate alarm_id from alarm_uid
UPDATE tickets t 
JOIN alarms a ON t.alarm_uid = a.alarm_uid
SET t.alarm_id = a.id;

-- 3. Remove invalid data
-- Delete tickets with NULL or invalid alarm_uid
DELETE FROM tickets WHERE alarm_uid IS NULL OR alarm_uid = '';

-- Delete duplicate tickets for same alarm_uid (keep latest)
DELETE t1 FROM tickets t1
INNER JOIN tickets t2 
WHERE t1.id < t2.id AND t1.alarm_uid = t2.alarm_uid;

-- 4. Modify table structures
-- Update alarms table status to ENUM and add standardized values
ALTER TABLE alarms MODIFY status ENUM('OPEN','ACK','RESOLVED','CLOSED','ACTIVE') DEFAULT 'OPEN';

-- Update tickets table status to ENUM and alarm_status to VARCHAR
ALTER TABLE tickets MODIFY status ENUM('OPEN','ACK','RESOLVED','CLOSED') DEFAULT 'OPEN';
ALTER TABLE tickets MODIFY alarm_status VARCHAR(100);

-- Enforce unique constraint on alarm_id and alarm_uid in tickets
ALTER TABLE tickets ADD UNIQUE INDEX IF NOT EXISTS uk_alarm_id (alarm_id);
ALTER TABLE tickets ADD UNIQUE INDEX IF NOT EXISTS uk_alarm_uid (alarm_uid);

-- 5. Standardize existing status values
-- Alarms: Active -> OPEN, Resolved -> RESOLVED
UPDATE alarms SET status = 'OPEN' WHERE status = 'Active';
UPDATE alarms SET status = 'RESOLVED' WHERE status = 'Resolved';
UPDATE alarms SET status = 'CLOSED' WHERE status = 'Suppressed';

-- Tickets: Open -> OPEN, ACK -> ACK, Closed -> CLOSED
UPDATE tickets SET status = 'OPEN' WHERE status = 'Open';
UPDATE tickets SET status = 'ACK' WHERE status = 'ACK';
UPDATE tickets SET status = 'CLOSED' WHERE status = 'Closed';

-- Initial attribution update based on resolved_by if present
UPDATE tickets SET alarm_status = CONCAT('Resolved by ', resolved_by) 
WHERE status IN ('RESOLVED', 'CLOSED') AND resolved_by IS NOT NULL;

SELECT "Standardization complete!" AS message;
