const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { logSync } = require('../services/syncLogger');
const { notifyTicketResolved, notifyTicketClosed, syncTicketCreate } = require('../services/cnmsSyncService');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alarm_ticket_sync'
};

const pool = mysql.createPool(dbConfig);
const getConnection = () => pool.getConnection();

const closeTicket = async (req, res) => {
    const { ticket_id } = req.params;
    const { action, resolved_by, skip_sync } = req.body;

    let connection;
    
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        const [tickets] = await connection.execute(
            'SELECT t.*, a.device_name, a.ip_address, a.severity FROM TICKETS t ' +
            'JOIN ALARMS a ON t.alarm_id = a.alarm_id WHERE t.ticket_id = ? FOR UPDATE',
            [ticket_id]
        );

        if (tickets.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }

        const ticket = tickets[0];

        if (ticket.status === 'CLOSED') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                error: 'Ticket is already closed'
            });
        }

        const closeAction = action || 'CLOSE';
        const sourceSystem = resolved_by || ticket.source;

        if (closeAction === 'RESOLVE') {
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = 'RESOLVED', 
                     sync_status = 'pending',
                     resolved_by = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [sourceSystem, ticket_id]
            );

            await connection.execute(
                `UPDATE ALARMS 
                 SET status = 'RESOLVED', 
                     resolved_by = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE alarm_id = ?`,
                [sourceSystem, ticket.alarm_id]
            );

            await logSync(
                connection,
                'TICKET',
                ticket_id,
                'RESOLVE',
                sourceSystem,
                'CNMS',
                { alarm_id: ticket.alarm_id, status: 'RESOLVED' },
                'success'
            );

            await connection.commit();

            const updatedTicket = { ...ticket, status: 'RESOLVED', resolved_by: sourceSystem };
            
            if (!skip_sync) {
                notifyTicketResolved(updatedTicket, { alarm_id: ticket.alarm_id }, sourceSystem)
                    .then(result => {
                        if (result.success) {
                            pool.execute(
                                "UPDATE TICKETS SET sync_status = 'synced' WHERE ticket_id = ?",
                                [ticket_id]
                            );
                        }
                    })
                    .catch(err => console.error('CNMS sync error:', err));
            }

            return res.json({
                success: true,
                message: 'Ticket resolved successfully',
                ticket_id,
                alarm_id: ticket.alarm_id,
                status: 'RESOLVED',
                resolved_by: sourceSystem
            });
        }

        if (closeAction === 'CLOSE') {
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = 'CLOSED', 
                     sync_status = 'pending',
                     resolved_by = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [sourceSystem, ticket_id]
            );

            await connection.execute(
                `UPDATE ALARMS 
                 SET status = 'CLOSED', 
                     resolved_by = ?,
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE alarm_id = ?`,
                [sourceSystem, ticket.alarm_id]
            );

            await logSync(
                connection,
                'TICKET',
                ticket_id,
                'CLOSE',
                sourceSystem,
                'CNMS',
                { alarm_id: ticket.alarm_id, status: 'CLOSED' },
                'success'
            );

            await connection.commit();

            const updatedTicket = { ...ticket, status: 'CLOSED', resolved_by: sourceSystem };

            if (!skip_sync) {
                notifyTicketClosed(updatedTicket, { alarm_id: ticket.alarm_id }, sourceSystem)
                    .then(result => {
                        if (result.success) {
                            pool.execute(
                                "UPDATE TICKETS SET sync_status = 'synced' WHERE ticket_id = ?",
                                [ticket_id]
                            );
                        }
                    })
                    .catch(err => console.error('CNMS sync error:', err));
            }

            return res.json({
                success: true,
                message: 'Ticket closed successfully',
                ticket_id,
                alarm_id: ticket.alarm_id,
                status: 'CLOSED',
                closed_by: sourceSystem
            });
        }

        await connection.rollback();
        return res.status(400).json({
            success: false,
            error: 'Invalid action. Use RESOLVE or CLOSE'
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Close ticket error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal server error closing ticket'
        });
    } finally {
        if (connection) connection.release();
    }
};

const acknowledgeTicket = async (req, res) => {
    const { ticket_id } = req.params;
    const { acknowledged_by } = req.body;

    let connection;
    
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        const [tickets] = await connection.execute(
            'SELECT * FROM TICKETS WHERE ticket_id = ? FOR UPDATE',
            [ticket_id]
        );

        if (tickets.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }

        const ticket = tickets[0];

        if (ticket.status === 'ACK') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                error: 'Ticket is already acknowledged'
            });
        }

        await connection.execute(
            `UPDATE TICKETS 
             SET status = 'ACK', 
                 updated_at = CURRENT_TIMESTAMP 
             WHERE ticket_id = ?`,
            [ticket_id]
        );

        await connection.execute(
            `UPDATE ALARMS 
             SET status = 'ACK',
                 updated_at = CURRENT_TIMESTAMP 
             WHERE alarm_id = ?`,
            [ticket.alarm_id]
        );

        await connection.commit();

        res.json({
            success: true,
            message: 'Ticket acknowledged',
            ticket_id,
            alarm_id: ticket.alarm_id,
            status: 'ACK',
            acknowledged_by: acknowledged_by || ticket.source
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Acknowledge ticket error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Internal server error acknowledging ticket'
        });
    } finally {
        if (connection) connection.release();
    }
};

router.post('/:ticket_id/close', closeTicket);
router.post('/:ticket_id/acknowledge', acknowledgeTicket);

module.exports = router;
