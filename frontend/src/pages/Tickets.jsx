// src/pages/Tickets.jsx
import { useEffect, useState } from "react";
import { getTickets, getLnmsNodes, handleAcknowledgeTicket, handleResolveTicket, fullSyncFromCnms } from "../api/api";
import { SevBadge, StatusBadge, NodeBadge, SlaBadge, fmt } from "../components/Badges";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("");
  const [severityF, setSeverityF] = useState("");
  const [nodeF, setNodeF] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const navigate = useNavigate();

  /* =========================
       LOAD TICKETS & NODES
       CNMS → LNMS fetch & sync
  ========================= */
  const load = async () => {
    setLoading(true);
    try {
      // 1️⃣ Sync old CNMS tickets to LNMS
      await fullSyncFromCnms();

      // 2️⃣ Fetch tickets & LNMS nodes
      const [t, n] = await Promise.all([getTickets(), getLnmsNodes()]);

      const sorted = (t.data || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );

      setTickets(sorted);
      setNodes(n.data || []);
    } catch (e) {
      console.error("Tickets load failed:", e);
    }
    setLoading(false);
  };

  // Initial load
  useEffect(() => { load(); }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  /* =========================
       KPI counts
  ========================= */
  const counts = {
    Total: tickets.length,
    Open: tickets.filter(t => t.status === "OPEN").length,
    ACK: tickets.filter(t => t.status === "ACK").length,
    Resolved: tickets.filter(t => t.status === "RESOLVED").length,
    Closed: tickets.filter(t => t.status === "CLOSED").length
  };
  /* =========================
       FILTER & SEARCH
  ========================= */
  const filtered = tickets.filter(t =>
    (
      t.ticket_uid?.toLowerCase().includes(search.toLowerCase()) ||
      t.short_id?.toLowerCase().includes(search.toLowerCase()) ||
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.device_name?.toLowerCase().includes(search.toLowerCase())
    )
    && (statusF ? t.status === statusF : true)
    && (severityF ? t.severity === severityF : true)
    && (nodeF ? t.lnms_node_id === nodeF : true)
  );

  /* =========================
       PAGINATION
  ========================= */
  const pages = Math.ceil(filtered.length / perPage);
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  /* =========================
       TIME FORMAT
  ========================= */
  const formatTime = (time) => {
    if (!time) return "—";
    return new Date(time).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Tickets</h1>
          <p className="text-sm text-gray-500">Auto-created by LNMS · resolved by CNMS</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        {[
          { l: "Total", v: counts.Total, c: "text-gray-800" },
          { l: "Open", v: counts.Open, c: "text-blue-600" },
          { l: "ACK", v: counts.ACK, c: "text-orange-600" },
          { l: "Resolved", v: counts.Resolved, c: "text-green-600" },
          { l: "Closed", v: counts.Closed, c: "text-gray-600" }
        ].map(k => (
          <div key={k.l} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-400 mb-1">{k.l}</div>
            <div className={`text-3xl font-bold font-mono ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>

      {/* QUICK STATUS FILTER */}
      <div className="flex gap-2 mb-4">
        {["", "OPEN", "ACK", "RESOLVED", "CLOSED"].map(s => (
          <button
            key={s || "ALL"}
            onClick={() => { setStatusF(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              statusF === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* SEARCH + FILTER PANEL */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          placeholder="Search ticket / device / title"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm w-64"
        />
        <select
          value={severityF}
          onChange={(e) => { setSeverityF(e.target.value); setPage(1); }}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Severity</option>
          <option>Critical</option>
          <option>Major</option>
          <option>Minor</option>
          <option>Warning</option>
        </select>
        <select
          value={nodeF}
          onChange={(e) => { setNodeF(e.target.value); setPage(1); }}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All Nodes</option>
          {nodes.map(n => <option key={n.node_id} value={n.node_id}>{n.node_id}</option>)}
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {["ID", "Title", "LNMS Node", "Device", "Severity", "Status", "SLA", "Created", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">Loading…</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-400">No tickets found</td>
              </tr>
            )}
            {visible.map(t => (
              <tr key={t.id} className="hover:bg-blue-50 cursor-pointer" onClick={() => navigate(`/tickets/${t.id}`)}>
                <td className="px-4 py-3 text-xs font-mono text-blue-600">{t.ticket_uid || t.short_id || t.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{t.title}</td>
                <td className="px-4 py-3"><NodeBadge nodeId={t.lnms_node_id} /></td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.device_name}</td>
                <td className="px-4 py-3"><SevBadge severity={t.severity} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3"><SlaBadge used={t.sla_used} total={t.sla_minutes} status={t.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">{fmt(t.created_at)}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} className="px-3 py-1 bg-gray-800 text-white text-xs rounded hover:bg-gray-700">View</button>
                  {t.status === "OPEN" && <button onClick={async (e) => { e.stopPropagation(); await handleAcknowledgeTicket(t.id); load(); }} className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600">ACK</button>}
                  {t.status === "ACK" && <button onClick={async (e) => { e.stopPropagation(); const note = prompt("Enter resolution note") || "Resolved via UI"; await handleResolveTicket(t.id, "Admin", note); load(); }} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700">Resolve</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {pages > 1 && (
        <div className="flex gap-2 mt-4 justify-center">
          <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Prev</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)} className={`px-3 py-1 rounded ${page === i + 1 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>{i + 1}</button>
          ))}
          <button onClick={() => setPage(p => Math.min(p + 1, pages))} disabled={page === pages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
        </div>
      )}
    </div>
  );
}
