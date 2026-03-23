import axios from "axios";

// Base URL: LNMS on 8000, fallback if not set
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

const API = axios.create({
  baseURL: BASE
});

/* =========================
       API CALLS
========================= */
export const getLnmsNodes      = ()           => API.get("/lnms-nodes");
export const getDashboardStats = ()           => API.get("/dashboard/stats");
export const getAlarms         = (params={}) => API.get("/alarms", { params });
export const getDevices        = (params={}) => API.get("/devices", { params });
export const getTickets        = (params={}) => API.get("/tickets", { params });
export const getTicket         = (id)        => API.get(`/tickets/${id}`);
export const addComment        = (id, body)  => API.post(`/tickets/${id}/comment`, body);
export const resolveTicket     = (id, body)  => API.put(`/tickets/${id}/resolve`, body);
export const getAuditLogs      = (limit=100) => API.get("/audit", { params:{ limit } });
export const getTcpLog         = (limit=50)  => API.get("/tcp-log", { params:{ limit } });
export const acknowledgeTicket = (id)        => API.put(`/tickets/${id}/ack`);

/* =========================
       HELPER FUNCTIONS
       for Tickets.jsx
========================= */
export const handleAcknowledgeTicket = async (ticketId) => {
  try {
    return await acknowledgeTicket(ticketId);
  } catch (err) {
    console.error(`Error acknowledging ticket ${ticketId}:`, err);
    throw err;
  }
};

export const handleResolveTicket = async (ticketId, user, note) => {
  try {
    return await resolveTicket(ticketId, { resolution_note: note, resolved_by: user });
  } catch (err) {
    console.error(`Error resolving ticket ${ticketId}:`, err);
    throw err;
  }
};

export const fullSyncFromCnms = async () => {
  try {
    // Call CNMS → LNMS sync API if exists, otherwise just log
    console.log("Syncing CNMS tickets to LNMS...");
    // Example: await API.post("/sync/cnms-to-lnms");
  } catch (err) {
    console.error("Error syncing CNMS tickets:", err);
  }
};