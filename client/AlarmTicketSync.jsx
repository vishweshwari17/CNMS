import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

export const useAlarmTicketSync = () => {
    const [alarms, setAlarms] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [counts, setCounts] = useState({});

    const fetchAlarms = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/alarms`);
            const data = await response.json();
            if (data.success) setAlarms(data.alarms);
        } catch (err) {
            console.error('Fetch alarms error:', err);
        }
    }, []);

    const fetchTickets = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/tickets`);
            const data = await response.json();
            if (data.success) setTickets(data.tickets);
        } catch (err) {
            console.error('Fetch tickets error:', err);
        }
    }, []);

    const fetchCounts = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/status`);
            const data = await response.json();
            if (data.success) setCounts(data);
        } catch (err) {
            console.error('Fetch counts error:', err);
        }
    }, []);

    const refreshAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchAlarms(), fetchTickets(), fetchCounts()]);
        setLoading(false);
    }, [fetchAlarms, fetchTickets, fetchCounts]);

    useEffect(() => {
        refreshAll();
        
        const interval = setInterval(refreshAll, 5000);
        return () => clearInterval(interval);
    }, [refreshAll]);

    const closeTicket = async (ticketId, action = 'CLOSE') => {
        try {
            const response = await fetch(`${API_BASE}/tickets/${ticketId}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action })
            });
            const data = await response.json();
            if (data.success) {
                await refreshAll();
            }
            return data;
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    };

    const acknowledgeTicket = async (ticketId) => {
        try {
            const response = await fetch(`${API_BASE}/tickets/${ticketId}/acknowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (data.success) {
                await refreshAll();
            }
            return data;
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        }
    };

    return {
        alarms,
        tickets,
        counts,
        loading,
        error,
        refreshAll,
        closeTicket,
        acknowledgeTicket
    };
};

export const AlarmTicketDashboard = () => {
    const { alarms, tickets, counts, loading, refreshAll, closeTicket } = useAlarmTicketSync();

    if (loading && alarms.length === 0) {
        return <div>Loading...</div>;
    }

    return (
        <div className="dashboard">
            <div className="stats">
                <div className="stat-card">
                    <h3>Total Alarms</h3>
                    <p>{counts.alarms?.reduce((acc, c) => acc + c.count, 0) || 0}</p>
                </div>
                <div className="stat-card">
                    <h3>Total Tickets</h3>
                    <p>{counts.tickets?.reduce((acc, c) => acc + c.count, 0) || 0}</p>
                </div>
                <div className="stat-card warning">
                    <h3>Pending Sync</h3>
                    <p>{counts.pending_syncs || 0}</p>
                </div>
            </div>
            
            <div className="data-grid">
                <div className="alarms-list">
                    <h2>Alarms</h2>
                    {alarms.map(alarm => (
                        <div key={alarm.alarm_id} className={`alarm-card ${alarm.severity}`}>
                            <span className="severity">{alarm.severity}</span>
                            <span className="status">{alarm.status}</span>
                            <span className="device">{alarm.device_name}</span>
                            <span className="resolved-by">{alarm.resolved_by && `Resolved by ${alarm.resolved_by}`}</span>
                        </div>
                    ))}
                </div>
                
                <div className="tickets-list">
                    <h2>Tickets</h2>
                    {tickets.map(ticket => (
                        <div key={ticket.ticket_id} className="ticket-card">
                            <span className="ticket-id">{ticket.ticket_id}</span>
                            <span className="status">{ticket.status}</span>
                            <span className="source">{ticket.source}</span>
                            <button onClick={() => closeTicket(ticket.ticket_id, 'RESOLVE')}>
                                Resolve
                            </button>
                            <button onClick={() => closeTicket(ticket.ticket_id, 'CLOSE')}>
                                Close
                            </button>
                        </div>
                    ))}
                </div>
            </div>
            
            <button onClick={refreshAll}>Refresh</button>
        </div>
    );
};

export default AlarmTicketDashboard;
