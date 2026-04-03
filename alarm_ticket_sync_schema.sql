-- =====================================================
-- ALARM-TICKET SYNCHRONIZATION SYSTEM
-- Database Schema for LNMS, SPIC-NMS, and CNMS
-- =====================================================

CREATE DATABASE IF NOT EXISTS alarm_ticket_sync;
USE alarm_ticket_sync;

-- =====================================================
-- ALARMS TABLE
-- =====================================================
DROP TABLE IF EXISTS TICKETS;
DROP TABLE IF EXISTS ALARMS;

CREATE TABLE ALARMS (
    alarm_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(255) NOT NULL,
    host_name VARCHAR(255),
    ip_address VARCHAR(45) NOT NULL,
    severity ENUM('Critical', 'Major', 'Minor') NOT NULL DEFAULT 'Minor',
    alarm_name VARCHAR(500) NOT NULL,
    status ENUM('OPEN', 'ACTIVE', 'ACK', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    source ENUM('LNMS', 'SPIC-NMS', 'CNMS') NOT NULL DEFAULT 'LNMS',
    ticket_created BOOLEAN NOT NULL DEFAULT 0,
    resolved_by ENUM('LNMS', 'SPIC-NMS', 'CNMS', NULL) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (alarm_id),
    INDEX idx_status (status),
    INDEX idx_source (source),
    INDEX idx_severity (severity),
    INDEX idx_ticket_created (ticket_created),
    INDEX idx_ip_address (ip_address),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TICKETS TABLE
-- =====================================================
CREATE TABLE TICKETS (
    ticket_id VARCHAR(64) NOT NULL,
    alarm_id VARCHAR(64) NOT NULL,
    title VARCHAR(500) NOT NULL,
    status ENUM('OPEN', 'ACK', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    sync_status ENUM('pending', 'synced', 'failed') NOT NULL DEFAULT 'pending',
    cnms_ticket_id VARCHAR(64) DEFAULT NULL,
    source ENUM('LNMS', 'SPIC-NMS', 'CNMS') NOT NULL DEFAULT 'LNMS',
    resolved_by ENUM('LNMS', 'SPIC-NMS', 'CNMS', NULL) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (ticket_id),
    UNIQUE KEY uk_alarm_id (alarm_id),
    
    CONSTRAINT fk_tickets_alarm_id 
        FOREIGN KEY (alarm_id) 
        REFERENCES ALARMS(alarm_id) 
        ON DELETE RESTRICT 
        ON UPDATE CASCADE,
    
    INDEX idx_status (status),
    INDEX idx_sync_status (sync_status),
    INDEX idx_source (source),
    INDEX idx_cnms_ticket_id (cnms_ticket_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- SYNC_LOG TABLE (Audit Trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS SYNC_LOG (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entity_type ENUM('ALARM', 'TICKET') NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'SYNC_SENT', 'SYNC_RECEIVED') NOT NULL,
    source_system ENUM('LNMS', 'SPIC-NMS', 'CNMS') NOT NULL,
    target_system ENUM('LNMS', 'SPIC-NMS', 'CNMS') DEFAULT NULL,
    payload JSON,
    status ENUM('success', 'failed', 'pending') NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_source_system (source_system),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- TRIGGERS FOR DATA INTEGRITY
-- =====================================================

DELIMITER //

-- Prevent duplicate ticket creation
CREATE TRIGGER trg_before_ticket_insert
BEFORE INSERT ON TICKETS
FOR EACH ROW
BEGIN
    DECLARE existing_count INT;
    
    SELECT COUNT(*) INTO existing_count
    FROM TICKETS
    WHERE alarm_id = NEW.alarm_id;
    
    IF existing_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Duplicate ticket: Ticket already exists for this alarm_id';
    END IF;
END //

-- Update alarm.ticket_created when ticket is created
CREATE TRIGGER trg_after_ticket_insert
AFTER INSERT ON TICKETS
FOR EACH ROW
BEGIN
    UPDATE ALARMS 
    SET ticket_created = 1, updated_at = CURRENT_TIMESTAMP
    WHERE alarm_id = NEW.alarm_id;
END //

-- Prevent alarm deletion if tickets exist
CREATE TRIGGER trg_before_alarm_delete
BEFORE DELETE ON ALARMS
FOR EACH ROW
BEGIN
    DECLARE ticket_count INT;
    
    SELECT COUNT(*) INTO ticket_count
    FROM TICKETS
    WHERE alarm_id = OLD.alarm_id;
    
    IF ticket_count > 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot delete alarm: Associated tickets exist';
    END IF;
END //

-- Sync alarm status when ticket status changes
CREATE TRIGGER trg_ticket_status_change
AFTER UPDATE ON TICKETS
FOR EACH ROW
BEGIN
    IF NEW.status = 'RESOLVED' THEN
        UPDATE ALARMS 
        SET status = 'RESOLVED', 
            resolved_by = NEW.source,
            updated_at = CURRENT_TIMESTAMP
        WHERE alarm_id = NEW.alarm_id;
    ELSEIF NEW.status = 'CLOSED' THEN
        UPDATE ALARMS 
        SET status = 'CLOSED', 
            resolved_by = NEW.source,
            updated_at = CURRENT_TIMESTAMP
        WHERE alarm_id = NEW.alarm_id;
    END IF;
END //

DELIMITER ;

-- =====================================================
-- STORED PROCEDURES FOR DATA CLEANUP
-- =====================================================

DELIMITER //

-- Remove orphan tickets (tickets without valid alarm_id)
CREATE PROCEDURE sp_cleanup_orphan_tickets()
BEGIN
    DELETE FROM TICKETS 
    WHERE alarm_id IS NULL OR alarm_id NOT IN (SELECT alarm_id FROM ALARMS);
    
    SELECT ROW_COUNT() AS deleted_count;
END //

-- Remove duplicate tickets (keep latest per alarm_id)
CREATE PROCEDURE sp_cleanup_duplicate_tickets()
BEGIN
    DELETE t1 FROM TICKETS t1
    INNER JOIN TICKETS t2
    WHERE t1.alarm_id = t2.alarm_id
      AND t1.ticket_id < t2.ticket_id;
    
    SELECT ROW_COUNT() AS deleted_count;
END //

-- Remove orphan alarms (alarms without tickets when ticket_created=1)
CREATE PROCEDURE sp_cleanup_orphan_alarms()
BEGIN
    UPDATE ALARMS 
    SET ticket_created = 0
    WHERE ticket_created = 1 
      AND alarm_id NOT IN (SELECT alarm_id FROM TICKETS);
    
    SELECT ROW_COUNT() AS updated_count;
END //

-- Full cleanup routine
CREATE PROCEDURE sp_full_cleanup()
BEGIN
    CALL sp_cleanup_orphan_tickets();
    CALL sp_cleanup_duplicate_tickets();
    CALL sp_cleanup_orphan_alarms();
END //

DELIMITER ;

-- =====================================================
-- VIEWS FOR DASHBOARD
-- =====================================================

CREATE OR REPLACE VIEW v_alarm_ticket_summary AS
SELECT 
    a.alarm_id,
    a.device_name,
    a.ip_address,
    a.severity,
    a.alarm_name,
    a.status AS alarm_status,
    a.source AS alarm_source,
    a.ticket_created,
    t.ticket_id,
    t.title AS ticket_title,
    t.status AS ticket_status,
    t.sync_status,
    t.cnms_ticket_id,
    t.resolved_by,
    a.created_at AS alarm_created_at,
    t.created_at AS ticket_created_at,
    a.updated_at AS last_updated
FROM ALARMS a
LEFT JOIN TICKETS t ON a.alarm_id = t.alarm_id;

CREATE OR REPLACE VIEW v_sync_status_counts AS
SELECT 
    source,
    status,
    COUNT(*) AS count
FROM (
    SELECT source, status FROM ALARMS
    UNION ALL
    SELECT source, status FROM TICKETS
) combined
GROUP BY source, status;

CREATE OR REPLACE VIEW v_pending_sync AS
SELECT 
    ticket_id,
    alarm_id,
    source,
    status,
    cnms_ticket_id,
    created_at,
    updated_at
FROM TICKETS
WHERE sync_status = 'pending';
