const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alarm_ticket_sync'
};

const pool = mysql.createPool(dbConfig);

const getConnection = () => pool.getConnection();

const createTicket = async (req, res) => {
    const { alarm_id, source, custom_title } = req.body;

    if (!alarm_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'alarm_id is required' 
        });
    }

    let connection;
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        const [alarms] = await connection.execute(
            'SELECT * FROM ALARMS WHERE alarm_id = ? FOR UPDATE',
            [alarm_id]
        );

        if (alarms.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'Alarm not found' 
            });
        }

        const alarm = alarms[0];

        if (alarm.ticket_created) {
            const [existingTicket] = await connection.execute(
                'SELECT * FROM TICKETS WHERE alarm_id = ?',
                [alarm_id]
            );
            
            await connection.commit();
            return res.status(409).json({ 
                success: false,
                error: 'Ticket already exists for this alarm',
                existing_ticket: {
                    ticket_id: existingTicket[0].ticket_id,
                    status: existingTicket[0].status,
                    created_at: existingTicket[0].created_at
                }
            });
        }

        const ticketId = `TKT-${uuidv4().substring(0, 8).toUpperCase()}`;
        const title = custom_title || `${alarm.alarm_name} - ${alarm.device_name}`;

        await connection.execute(
            `INSERT INTO TICKETS (ticket_id, alarm_id, title, status, sync_status, source) 
             VALUES (?, ?, ?, 'OPEN', 'pending', ?)`,
            [ticketId, alarm_id, title, source || alarm.source]
        );

        const [ticketRows] = await connection.execute(
            'SELECT * FROM TICKETS WHERE ticket_id = ?',
            [ticketId]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            ticket: {
                ticket_id: ticketRows[0].ticket_id,
                alarm_id: ticketRows[0].alarm_id,
                title: ticketRows[0].title,
                status: ticketRows[0].status,
                sync_status: ticketRows[0].sync_status,
                source: ticketRows[0].source,
                created_at: ticketRows[0].created_at
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                success: false,
                error: 'Duplicate ticket prevented by database constraint' 
            });
        }
        
        console.error('Ticket creation error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    } finally {
        if (connection) connection.release();
    }
};

const createTicketIdempotent = async (req, res) => {
    const { alarm_id, source, custom_title, idempotency_key } = req.body;

    if (!alarm_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'alarm_id is required' 
        });
    }

    const cacheKey = `ticket:idempotent:${idempotency_key || alarm_id}`;
    let connection;
    
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        const [alarms] = await connection.execute(
            'SELECT * FROM ALARMS WHERE alarm_id = ? FOR UPDATE',
            [alarm_id]
        );

        if (alarms.length === 0) {
            await connection.rollback();
            return res.status(404).json({ 
                success: false, 
                error: 'Alarm not found' 
            });
        }

        const alarm = alarms[0];

        if (alarm.ticket_created) {
            const [existingTicket] = await connection.execute(
                'SELECT * FROM TICKETS WHERE alarm_id = ?',
                [alarm_id]
            );
            await connection.commit();
            return res.status(200).json({
                success: true,
                message: 'Ticket already exists (idempotent response)',
                ticket: existingTicket[0],
                created: false
            });
        }

        const ticketId = `TKT-${uuidv4().substring(0, 8).toUpperCase()}`;
        const title = custom_title || `${alarm.alarm_name} - ${alarm.device_name}`;

        await connection.execute(
            `INSERT INTO TICKETS (ticket_id, alarm_id, title, status, sync_status, source) 
             VALUES (?, ?, ?, 'OPEN', 'pending', ?)`,
            [ticketId, alarm_id, title, source || alarm.source]
        );

        const [ticketRows] = await connection.execute(
            'SELECT * FROM TICKETS WHERE ticket_id = ?',
            [ticketId]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            ticket: ticketRows[0],
            created: true
        });

    } catch (error) {
        if (connection) await connection.rollback();
        
        if (error.code === 'ER_DUP_ENTRY') {
            const [existingTicket] = await pool.execute(
                'SELECT * FROM TICKETS WHERE alarm_id = ?',
                [alarm_id]
            );
            return res.status(200).json({
                success: true,
                message: 'Ticket already exists (idempotent response)',
                ticket: existingTicket[0],
                created: false
            });
        }
        
        console.error('Ticket creation error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    } finally {
        if (connection) connection.release();
    }
};

const autoCreateTicketOnAlarm = async (alarmId, source) => {
    let connection;
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        const [alarms] = await connection.execute(
            'SELECT * FROM ALARMS WHERE alarm_id = ? FOR UPDATE',
            [alarmId]
        );

        if (alarms.length === 0 || alarms[0].ticket_created) {
            await connection.rollback();
            return null;
        }

        const alarm = alarms[0];
        const ticketId = `TKT-${uuidv4().substring(0, 8).toUpperCase()}`;
        const title = `${alarm.alarm_name} - ${alarm.device_name}`;

        await connection.execute(
            `INSERT INTO TICKETS (ticket_id, alarm_id, title, status, sync_status, source) 
             VALUES (?, ?, ?, 'OPEN', 'pending', ?)`,
            [ticketId, alarmId, title, source || alarm.source]
        );

        const [ticketRows] = await connection.execute(
            'SELECT * FROM TICKETS WHERE ticket_id = ?',
            [ticketId]
        );

        await connection.commit();
        return ticketRows[0];

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Auto ticket creation error:', error);
        return null;
    } finally {
        if (connection) connection.release();
    }
};

router.post('/', createTicket);
router.post('/idempotent', createTicketIdempotent);
router.post('/auto', autoCreateTicketOnAlarm);

module.exports = router;
module.exports.createTicket = createTicket;
module.exports.autoCreateTicketOnAlarm = autoCreateTicketOnAlarm;
