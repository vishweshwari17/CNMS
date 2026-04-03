const express = require('express');
const router = express.Router();
const ticketController = require('./ticketController');
const { authenticate } = require('../middleware/auth');

router.post('/', authenticate, ticketController.createTicket);
router.post('/idempotent', authenticate, ticketController.createTicketIdempotent);
router.post('/auto', ticketController.autoCreateTicketOnAlarm);

router.get('/:ticket_id', async (req, res) => {
    try {
        const [tickets] = await pool.execute(
            'SELECT * FROM TICKETS WHERE ticket_id = ?',
            [req.params.ticket_id]
        );
        
        if (tickets.length === 0) {
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket not found' 
            });
        }
        
        res.json({ success: true, ticket: tickets[0] });
    } catch (error) {
        console.error('Error fetching ticket:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

router.get('/', async (req, res) => {
    const { status, source, page = 1, limit = 50 } = req.query;
    
    let query = 'SELECT * FROM TICKETS WHERE 1=1';
    const params = [];
    
    if (status) {
        query += ' AND status = ?';
        params.push(status);
    }
    if (source) {
        query += ' AND source = ?';
        params.push(source);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    
    try {
        const [tickets] = await pool.execute(query, params);
        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM TICKETS'
        );
        
        res.json({ 
            success: true, 
            tickets,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult[0].total
            }
        });
    } catch (error) {
        console.error('Error fetching tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error' 
        });
    }
});

module.exports = router;
