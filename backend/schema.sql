-- ============================================================
-- CNMS Database Schema (MariaDB)
-- Central Network Management System
-- ============================================================

CREATE DATABASE IF NOT EXISTS cnms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cnms_db;

-- ── LNMS Nodes ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lnms_nodes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  node_id       VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. LNMS-MUM-01
  label         VARCHAR(100) NOT NULL,
  location      VARCHAR(150),
  ip_address    VARCHAR(45),
  port          INT DEFAULT 9000,
  status        ENUM('CONNECTED','DISCONNECTED','ERROR') DEFAULT 'DISCONNECTED',
  last_seen     DATETIME,
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW()
);

-- ── Devices ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  lnms_node_id  VARCHAR(50),
  hostname      VARCHAR(150) NOT NULL,
  ip_address    VARCHAR(45),
  device_type   ENUM('Router','Switch','Firewall','Server','AP','Other') DEFAULT 'Other',
  location      VARCHAR(150),
  status        ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (lnms_node_id) REFERENCES lnms_nodes(node_id) ON DELETE SET NULL
);

-- ── Alarms ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alarms (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  alarm_uid     VARCHAR(100) NOT NULL UNIQUE,   -- from LNMS
  lnms_node_id  VARCHAR(50)  NOT NULL,
  device_id     INT,
  device_name   VARCHAR(150),
  alarm_type    VARCHAR(200) NOT NULL,
  severity      ENUM('Critical','Major','Minor','Warning','Info') DEFAULT 'Info',
  status        ENUM('Active','Resolved','Suppressed') DEFAULT 'Active',
  description   TEXT,
  raised_at     DATETIME NOT NULL,
  resolved_at   DATETIME,
  raw_payload   JSON,                           -- original TCP message stored
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (lnms_node_id) REFERENCES lnms_nodes(node_id),
  FOREIGN KEY (device_id)    REFERENCES devices(id) ON DELETE SET NULL,
  INDEX idx_status   (status),
  INDEX idx_severity (severity),
  INDEX idx_lnms     (lnms_node_id)
);

-- ── Tickets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ticket_uid    VARCHAR(100) NOT NULL UNIQUE,   -- UUID from LNMS
  short_id      VARCHAR(20),                    -- TKT-XXXX display
  lnms_node_id  VARCHAR(50)  NOT NULL,
  alarm_id      INT,
  alarm_uid     VARCHAR(100),
  device_name   VARCHAR(150),
  title         VARCHAR(300) NOT NULL,
  severity      ENUM('Critical','Major','Minor','Warning','Info') DEFAULT 'Info',
  status        ENUM('Open','ACK','Closed') DEFAULT 'Open',
  alarm_status  ENUM('PROBLEM','ACTIVE','RESOLVED'),
  alarm_source  ENUM('LNMS','SPIC-NMS'),
  last_alarm_update DATETIME,
  sla_minutes   INT DEFAULT 60,
  sla_limit_minutes INT DEFAULT 60,
  sla_used      INT DEFAULT 0,
  sla_status    ENUM('ON_TIME','WARNING','BREACHED') DEFAULT 'ON_TIME',
  resolved_by   VARCHAR(100),
  resolved_at   DATETIME,
  resolution_note TEXT,
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME DEFAULT NOW() ON UPDATE NOW(),
  FOREIGN KEY (lnms_node_id) REFERENCES lnms_nodes(node_id),
  FOREIGN KEY (alarm_id)     REFERENCES alarms(id) ON DELETE SET NULL,
  INDEX idx_status   (status),
  INDEX idx_severity (severity),
  INDEX idx_lnms     (lnms_node_id)
);

-- ── Ticket Messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_messages (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id     INT NOT NULL,
  sender        VARCHAR(100) NOT NULL,          -- 'CNMS' or 'LNMS-MUM-01' etc
  msg_type      ENUM('TICKET_CREATE','STATUS_CHANGE','COMMENT','ALARM_UPDATE',
                     'TICKET_RESOLVED','RESOLUTION_ACK') NOT NULL,
  body          TEXT NOT NULL,
  is_resolved   BOOLEAN DEFAULT FALSE,
  sent_at       DATETIME DEFAULT NOW(),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_ticket (ticket_id)
);

-- ── TCP Sync Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tcp_sync_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  lnms_node_id  VARCHAR(50),
  direction     ENUM('INBOUND','OUTBOUND') NOT NULL,
  msg_type      VARCHAR(100),
  payload       JSON,
  status        ENUM('SUCCESS','FAILED','PENDING') DEFAULT 'SUCCESS',
  error_msg     TEXT,
  created_at    DATETIME DEFAULT NOW(),
  INDEX idx_lnms     (lnms_node_id),
  INDEX idx_created  (created_at)
);

-- ── Audit Logs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id        INT AUTO_INCREMENT PRIMARY KEY,
  user_name     VARCHAR(100) NOT NULL,
  action        VARCHAR(200) NOT NULL,
  entity_type   VARCHAR(100),
  entity_id     VARCHAR(100),
  details       JSON,
  created_at    DATETIME DEFAULT NOW(),
  INDEX idx_user    (user_name),
  INDEX idx_entity  (entity_type, entity_id)
);

-- ── Seed: LNMS Nodes ──────────────────────────────────────────
INSERT IGNORE INTO lnms_nodes (node_id, label, location, ip_address, port, status, last_seen) VALUES
('LNMS-MUM-01', 'LNMS-MUM-01', 'Mumbai NOC',    '10.10.1.101', 9001, 'CONNECTED', NOW()),
('LNMS-BLR-02', 'LNMS-BLR-02', 'Bangalore NOC', '10.10.2.101', 9002, 'CONNECTED', NOW());

-- ── Seed: Devices ─────────────────────────────────────────────
INSERT IGNORE INTO devices (lnms_node_id, hostname, ip_address, device_type, location, status) VALUES
('LNMS-MUM-01', 'Router_Test',        '10.10.1.1',  'Router',   'Mumbai',    'ACTIVE'),
('LNMS-MUM-01', 'Juniper-MX2',        '10.10.1.2',  'Router',   'Mumbai',    'ACTIVE'),
('LNMS-MUM-01', 'core-router-01',     '10.10.1.3',  'Router',   'Mumbai',    'ACTIVE'),
('LNMS-BLR-02', 'CompanyTest_Device', '10.20.1.1',  'Server',   'Bangalore', 'ACTIVE'),
('LNMS-BLR-02', 'Test_Device',        '10.20.1.2',  'Server',   'Bangalore', 'ACTIVE'),
('LNMS-BLR-02', 'Core-SW-BLR',        '10.20.1.3',  'Switch',   'Bangalore', 'ACTIVE');

-- ── Seed: Alarms ──────────────────────────────────────────────
INSERT IGNORE INTO alarms (alarm_uid, lnms_node_id, device_name, alarm_type, severity, status, raised_at) VALUES
('ALM-001','LNMS-MUM-01','Router_Test',        'Link Down',           'Minor',    'Active',   NOW() - INTERVAL 16 HOUR),
('ALM-002','LNMS-MUM-01','Router_Test',        'Link Down',           'Major',    'Active',   NOW() - INTERVAL 15 HOUR),
('ALM-003','LNMS-BLR-02','CompanyTest_Device', 'Dashboard Alarm',     'Major',    'Active',   NOW() - INTERVAL 14 HOUR),
('ALM-004','LNMS-BLR-02','Test_Device',        'Auto Alarm',          'Major',    'Active',   NOW() - INTERVAL 14 HOUR),
('ALM-005','LNMS-MUM-01','Juniper-MX2',        'BGP Down',            'Critical', 'Active',   NOW() - INTERVAL 8 HOUR),
('ALM-006','LNMS-BLR-02','Core-SW-BLR',        'CPU High Utilization','Major',    'Resolved', NOW() - INTERVAL 20 HOUR);

-- ── Seed: Tickets ─────────────────────────────────────────────
INSERT IGNORE INTO tickets (ticket_uid, short_id, lnms_node_id, alarm_uid, device_name, title, severity, status, sla_minutes, sla_used) VALUES
('edc5443d-7d71','TKT-001','LNMS-MUM-01','ALM-001','Router_Test',        'Link Down on Router',          'Minor',    'Open',   60, 56),
('09c1f281-43cd','TKT-002','LNMS-MUM-01','ALM-002','Router_Test',        'Link Down on Router',          'Major',    'Open',   45, 39),
('4c458347-f202','TKT-003','LNMS-BLR-02','ALM-003','CompanyTest_Device', 'Company Dashboard Test Alarm', 'Major',    'Open',   45, 35),
('fe28e05e-9955','TKT-004','LNMS-BLR-02','ALM-004','Test_Device',        'Test Auto Ticket Alarm',       'Major',    'Open',   45, 22),
('db73d152-a598','TKT-005','LNMS-MUM-01','ALM-005','Juniper-MX2',        'BGP Down',                     'Critical', 'Open',   30, 38),
('108310a9-8a64','TKT-006','LNMS-BLR-02','ALM-006','Core-SW-BLR',        'CPU High Utilization',         'Major',    'Closed', 90, 45);

-- Update TKT-006 resolved fields
UPDATE tickets SET
  resolved_by='Admin',
  resolved_at=NOW() - INTERVAL 17 HOUR,
  resolution_note='CPU spike caused by STP recalculation. Optimized spanning tree config. Alarm cleared.'
WHERE short_id='TKT-006';

-- ── Seed: Messages ────────────────────────────────────────────
INSERT INTO ticket_messages (ticket_id, sender, msg_type, body) VALUES
(1,'LNMS-MUM-01','TICKET_CREATE','Auto-created. Alarm ALM-001: Link Down on Router_Test. Severity: Minor.'),
(1,'CNMS','COMMENT','Engineer investigating link state on Router_Test port Gi0/1.'),
(2,'LNMS-MUM-01','TICKET_CREATE','Auto-created. Alarm ALM-002: Link Down on Router_Test. Severity: Major.'),
(3,'LNMS-BLR-02','TICKET_CREATE','Auto-created. Alarm ALM-003: Dashboard health check failed on CompanyTest_Device.'),
(4,'LNMS-BLR-02','TICKET_CREATE','Auto-created. Alarm ALM-004: Auto ticket test alarm on Test_Device.'),
(5,'LNMS-MUM-01','TICKET_CREATE','Auto-created. Alarm ALM-005: BGP session DOWN on Juniper-MX2. Peer 192.168.1.1 unreachable.'),
(5,'CNMS','COMMENT','SLA BREACHED. Escalating to senior network engineer.'),
(6,'LNMS-BLR-02','TICKET_CREATE','Auto-created. Alarm ALM-006: CPU utilization at 94% on Core-SW-BLR.'),
(6,'CNMS','COMMENT','Identified STP recalculation storm. Applying portfast and BPDU guard.'),
(6,'CNMS','TICKET_RESOLVED','RESOLVED. CPU normalized to 32%. Root cause: STP recalculation.',TRUE),
(6,'LNMS-BLR-02','RESOLUTION_ACK','ACK. Alarm ALM-006 cleared on LNMS-BLR-02. TCP channel closed.');
