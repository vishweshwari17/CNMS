const express = require('express');
const mysql = require('mysql2/promise');

const ticketRoutes = require('./tickets/ticketRoutes');
const ticketCloseRoutes = require('./tickets/ticketClose');
const cnmsWebhookRoutes = require('./webhooks/cnmsWebhook');

const app = express();

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

app.use('/api/tickets', ticketRoutes);
app.use('/api/tickets', ticketCloseRoutes);
app.use('/webhook', cnmsWebhookRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Alarm-Ticket Sync',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/status', async (req, res) => {
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'alarm_ticket_sync'
        });

        const [alarmCounts] = await pool.execute(
            'SELECT status, COUNT(*) as count FROM ALARMS GROUP BY status'
        );
        
        const [ticketCounts] = await pool.execute(
            'SELECT status, COUNT(*) as count FROM TICKETS GROUP BY status'
        );

        const [pendingSyncs] = await pool.execute(
            "SELECT COUNT(*) as count FROM TICKETS WHERE sync_status = 'pending'"
        );

        res.json({
            success: true,
            alarms: alarmCounts,
            tickets: ticketCounts,
            pending_syncs: pendingSyncs[0].count
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Alarm-Ticket Sync API running on port ${PORT}`);
    });
}

module.exports = app;
