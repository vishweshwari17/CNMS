const axios = require('axios');
const { logSync } = require('./syncLogger');

const CNMS_API_URL = process.env.CNMS_API_URL || 'https://cnms.example.com/api';
const CNMS_API_KEY = process.env.CNMS_API_KEY || 'cnms-api-key';

const cnmsClient = axios.create({
    baseURL: CNMS_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CNMS_API_KEY
    },
    timeout: 10000
});

const sendToCnms = async (endpoint, payload, sourceSystem) => {
    try {
        const response = await cnmsClient.post(endpoint, payload);
        
        return {
            success: true,
            data: response.data,
            status: response.status
        };
    } catch (error) {
        console.error(`CNMS sync error [${endpoint}]:`, error.message);
        
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 500
        };
    }
};

const syncAlarmToCnms = async (alarm, action, sourceSystem) => {
    const payload = {
        alarm_id: alarm.alarm_id,
        device_name: alarm.device_name,
        host_name: alarm.host_name,
        ip_address: alarm.ip_address,
        severity: alarm.severity,
        alarm_name: alarm.alarm_name,
        status: alarm.status,
        source: sourceSystem,
        action,
        timestamp: new Date().toISOString()
    };

    return await sendToCnms('/webhook/lnms-alarm-update', payload, sourceSystem);
};

const syncTicketToCnms = async (ticket, action, sourceSystem) => {
    const payload = {
        ticket_id: ticket.ticket_id,
        alarm_id: ticket.alarm_id,
        title: ticket.title,
        status: ticket.status,
        source: sourceSystem,
        action,
        timestamp: new Date().toISOString()
    };

    return await sendToCnms('/webhook/lnms-ticket-update', payload, sourceSystem);
};

const notifyTicketResolved = async (ticket, alarm, sourceSystem) => {
    const payload = {
        ticket_id: ticket.ticket_id,
        alarm_id: ticket.alarm_id,
        status: 'RESOLVED',
        resolved_by: sourceSystem,
        cnms_ticket_id: ticket.cnms_ticket_id,
        resolution_summary: `Resolved by ${sourceSystem}`,
        timestamp: new Date().toISOString()
    };

    return await sendToCnms('/webhook/lnms-resolution', payload, sourceSystem);
};

const notifyTicketClosed = async (ticket, alarm, sourceSystem) => {
    const payload = {
        ticket_id: ticket.ticket_id,
        alarm_id: ticket.alarm_id,
        status: 'CLOSED',
        closed_by: sourceSystem,
        cnms_ticket_id: ticket.cnms_ticket_id,
        timestamp: new Date().toISOString()
    };

    return await sendToCnms('/webhook/lnms-closure', payload, sourceSystem);
};

const syncTicketCreate = async (ticket, alarm, sourceSystem) => {
    const payload = {
        ticket_id: ticket.ticket_id,
        alarm_id: ticket.alarm_id,
        title: ticket.title,
        status: 'OPEN',
        source: sourceSystem,
        severity: alarm.severity,
        device_name: alarm.device_name,
        ip_address: alarm.ip_address,
        cnms_ticket_id: ticket.cnms_ticket_id,
        timestamp: new Date().toISOString()
    };

    return await sendToCnms('/webhook/lnms-ticket-create', payload, sourceSystem);
};

const retryFailedSyncs = async (pool, maxRetries = 3) => {
    const [failedLogs] = await pool.execute(
        `SELECT * FROM SYNC_LOG 
         WHERE status = 'failed' 
           AND (retry_count IS NULL OR retry_count < ?) 
         ORDER BY created_at ASC LIMIT 50`,
        [maxRetries]
    );

    const results = [];
    
    for (const log of failedLogs) {
        try {
            let endpoint;
            let payload = JSON.parse(log.payload);
            
            if (log.entity_type === 'ALARM') {
                const result = await syncAlarmToCnms(payload, log.action, log.source_system);
                if (result.success) {
                    await pool.execute(
                        'UPDATE SYNC_LOG SET status = ?, retry_count = COALESCE(retry_count, 0) + 1 WHERE log_id = ?',
                        ['success', log.log_id]
                    );
                }
            } else if (log.entity_type === 'TICKET') {
                const result = await syncTicketToCnms(payload, log.action, log.source_system);
                if (result.success) {
                    await pool.execute(
                        'UPDATE SYNC_LOG SET status = ?, retry_count = COALESCE(retry_count, 0) + 1 WHERE log_id = ?',
                        ['success', log.log_id]
                    );
                }
            }
            
            results.push({ log_id: log.log_id, success: true });
        } catch (error) {
            await pool.execute(
                'UPDATE SYNC_LOG SET retry_count = COALESCE(retry_count, 0) + 1 WHERE log_id = ?',
                [log.log_id]
            );
            results.push({ log_id: log.log_id, success: false, error: error.message });
        }
    }
    
    return results;
};

module.exports = {
    cnmsClient,
    sendToCnms,
    syncAlarmToCnms,
    syncTicketToCnms,
    notifyTicketResolved,
    notifyTicketClosed,
    syncTicketCreate,
    retryFailedSyncs
};
