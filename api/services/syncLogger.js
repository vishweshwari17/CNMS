const logSync = async (connection, entityType, entityId, action, sourceSystem, targetSystem, payload, status, errorMessage = null) => {
    try {
        await connection.execute(
            `INSERT INTO SYNC_LOG 
             (entity_type, entity_id, action, source_system, target_system, payload, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entityType,
                entityId,
                action,
                sourceSystem,
                targetSystem,
                JSON.stringify(payload),
                status,
                errorMessage
            ]
        );
        return true;
    } catch (error) {
        console.error('Sync log error:', error);
        return false;
    }
};

const getSyncHistory = async (pool, entityType, entityId, limit = 50) => {
    try {
        const [logs] = await pool.execute(
            `SELECT * FROM SYNC_LOG 
             WHERE entity_type = ? AND entity_id = ? 
             ORDER BY created_at DESC LIMIT ?`,
            [entityType, entityId, limit]
        );
        return logs;
    } catch (error) {
        console.error('Get sync history error:', error);
        return [];
    }
};

const getPendingSyncs = async (pool) => {
    try {
        const [logs] = await pool.execute(
            `SELECT * FROM SYNC_LOG WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100`
        );
        return logs;
    } catch (error) {
        console.error('Get pending syncs error:', error);
        return [];
    }
};

const markSyncComplete = async (pool, logId) => {
    try {
        await pool.execute(
            `UPDATE SYNC_LOG SET status = 'success' WHERE log_id = ?`,
            [logId]
        );
        return true;
    } catch (error) {
        console.error('Mark sync complete error:', error);
        return false;
    }
};

const markSyncFailed = async (pool, logId, errorMessage) => {
    try {
        await pool.execute(
            `UPDATE SYNC_LOG SET status = 'failed', error_message = ? WHERE log_id = ?`,
            [errorMessage, logId]
        );
        return true;
    } catch (error) {
        console.error('Mark sync failed error:', error);
        return false;
    }
};

module.exports = {
    logSync,
    getSyncHistory,
    getPendingSyncs,
    markSyncComplete,
    markSyncFailed
};
