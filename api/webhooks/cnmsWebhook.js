const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { logSync } = require('../services/syncLogger');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'alarm_ticket_sync'
};

const pool = mysql.createPool(dbConfig);
const getConnection = () => pool.getConnection();

const WEBHOOK_SECRET = process.env.CNMS_WEBHOOK_SECRET || 'cnms-webhook-secret';

const verifyWebhookSignature = (req, res, next) => {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    
    if (!signature || !timestamp) {
        return res.status(401).json({ 
            success: false, 
            error: 'Missing webhook signature' 
        });
    }
    
    const expectedSignature = require('crypto')
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(`${timestamp}:${JSON.stringify(req.body)}`)
        .digest('hex');
    
    if (signature !== expectedSignature) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid webhook signature' 
        });
    }
    
    if (Date.now() - parseInt(timestamp) > 300000) {
        return res.status(401).json({ 
            success: false, 
            error: 'Webhook timestamp expired' 
        });
    }
    
    next();
};

const handleCnmsUpdate = async (req, res) => {
    const { 
        cnms_ticket_id, 
        alarm_id, 
        ticket_id,
        status, 
        action,
        source_system,
        timestamp 
    } = req.body;

    let connection;
    
    try {
        connection = await getConnection();
        await connection.beginTransaction();

        let targetTicketId = ticket_id;
        let targetAlarmId = alarm_id;

        if (cnms_ticket_id && !ticket_id) {
            const [tickets] = await connection.execute(
                'SELECT * FROM TICKETS WHERE cnms_ticket_id = ?',
                [cnms_ticket_id]
            );
            
            if (tickets.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    error: 'Ticket not found with cnms_ticket_id'
                });
            }
            
            targetTicketId = tickets[0].ticket_id;
            targetAlarmId = tickets[0].alarm_id;
        }

        if (action === 'RESOLVE') {
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = 'RESOLVED', 
                     sync_status = 'synced',
                     resolved_by = 'CNMS',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [targetTicketId]
            );
            
            await connection.execute(
                `UPDATE ALARMS 
                 SET status = 'RESOLVED', 
                     resolved_by = 'CNMS',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE alarm_id = ?`,
                [targetAlarmId]
            );
            
            await logSync(
                connection,
                'TICKET',
                targetTicketId,
                'SYNC_RECEIVED',
                'CNMS',
                'LNMS/SPIC-NMS',
                req.body,
                'success'
            );
            
            await logSync(
                connection,
                'ALARM',
                targetAlarmId,
                'UPDATE',
                'CNMS',
                null,
                { status: 'RESOLVED', resolved_by: 'CNMS' },
                'success'
            );
            
            await connection.commit();
            
            return res.json({
                success: true,
                message: 'Ticket and alarm resolved',
                resolved_by: 'CNMS',
                ticket_id: targetTicketId,
                alarm_id: targetAlarmId
            });
        }
        
        if (action === 'CLOSE') {
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = 'CLOSED', 
                     sync_status = 'synced',
                     resolved_by = 'CNMS',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [targetTicketId]
            );
            
            await connection.execute(
                `UPDATE ALARMS 
                 SET status = 'CLOSED', 
                     resolved_by = 'CNMS',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE alarm_id = ?`,
                [targetAlarmId]
            );
            
            await connection.commit();
            
            return res.json({
                success: true,
                message: 'Ticket and alarm closed',
                closed_by: 'CNMS',
                ticket_id: targetTicketId,
                alarm_id: targetAlarmId
            });
        }
        
        if (action === 'ACK') {
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = 'ACK', 
                     sync_status = 'synced',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [targetTicketId]
            );
            
            await connection.execute(
                `UPDATE ALARMS 
                 SET status = 'ACK',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE alarm_id = ?`,
                [targetAlarmId]
            );
            
            await connection.commit();
            
            return res.json({
                success: true,
                message: 'Ticket and alarm acknowledged',
                ticket_id: targetTicketId,
                alarm_id: targetAlarmId
            });
        }
        
        if (action === 'DELETE') {
            await connection.execute(
                'DELETE FROM TICKETS WHERE ticket_id = ?',
                [targetTicketId]
            );
            
            await connection.execute(
                'UPDATE ALARMS SET ticket_created = 0 WHERE alarm_id = ?',
                [targetAlarmId]
            );
            
            await connection.commit();
            
            return res.json({
                success: true,
                message: 'Ticket deleted, alarm ticket_created reset',
                ticket_id: targetTicketId,
                alarm_id: targetAlarmId
            });
        }
        
        if (status && !action) {
            const validStatuses = ['OPEN', 'ACK', 'RESOLVED', 'CLOSED'];
            if (!validStatuses.includes(status)) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Invalid status value'
                });
            }
            
            await connection.execute(
                `UPDATE TICKETS 
                 SET status = ?, 
                     sync_status = 'synced',
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE ticket_id = ?`,
                [status, targetTicketId]
            );
            
            await connection.commit();
            
            return res.json({
                success: true,
                message: `Ticket status updated to ${status}`,
                ticket_id: targetTicketId
            });
        }
        
        await connection.rollback();
        return res.status(400).json({
            success: false,
            error: 'Invalid action or missing required fields'
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('CNMS webhook error:', error);
        
        await logSync(
            pool,
            'TICKET',
            ticket_id || cnms_ticket_id,
            'SYNC_RECEIVED',
            'CNMS',
            null,
            req.body,
            'failed',
            error.message
        ).catch(() => {});
        
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error processing webhook' 
        });
    } finally {
        if (connection) connection.release();
    }
};

const handleCnmsBatchUpdate = async (req, res) => {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'updates array is required'
        });
    }
    
    const results = [];
    
    for (const update of updates) {
        req.body = update;
        try {
            const result = await handleCnmsUpdate(req, { 
                json: (data) => data 
            });
            results.push({ 
                cnms_ticket_id: update.cnms_ticket_id,
                ...result 
            });
        } catch (error) {
            results.push({
                cnms_ticket_id: update.cnms_ticket_id,
                success: false,
                error: error.message
            });
        }
    }
    
    res.json({
        success: true,
        processed: results.length,
        results
    });
};

router.post('/cnms-update', verifyWebhookSignature, handleCnmsUpdate);
router.post('/cnms-batch-update', verifyWebhookSignature, handleCnmsBatchUpdate);

router.get('/health', (req, res) => {
    res.json({
        success: true,
        endpoint: 'CNMS Webhook Handler',
        status: 'active',
        supported_actions: ['RESOLVE', 'CLOSE', 'ACK', 'DELETE']
    });
});

module.exports = router;
