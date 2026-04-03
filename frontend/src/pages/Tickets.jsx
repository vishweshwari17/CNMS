// src/pages/Tickets.jsx
import { useEffect, useState } from "react";
import { getTickets, getLnmsNodes, handleAcknowledgeTicket, handleResolveTicket, handleCloseTicket, fullSyncFromCnms } from "../api/api";
import { SevBadge, StatusBadge, NodeBadge, SlaBadge, AlarmBadge, fmt } from "../components/Badges";
import { useNavigate } from "react-router-dom";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

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
              {["ID", "Title", "LNMS Node", "Device", "Severity", "Tkt Status", "Alarm Status", "SLA", "Created", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide">{h}</th>
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
            {visible.map(t => {
              const isBreached = t.sla_status === "BREACHED" && t.status !== "CLOSED" && t.status !== "RESOLVED";
              return (
              <tr key={t.id} className={`cursor-pointer transition-colors ${isBreached ? 'bg-red-50 hover:bg-red-100 border-l-4 border-l-red-500' : 'hover:bg-blue-50'}`} onClick={() => navigate(`/tickets/${t.id}`)}>
                <td className="px-4 py-3 text-xs font-mono text-blue-600">{t.ticket_uid || t.short_id || t.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">
                  {isBreached && <span className="text-red-600 mr-2 animate-pulse" title="SLA Breached">⚠</span>}
                  {t.title}
                </td>
                <td className="px-4 py-3"><NodeBadge nodeId={t.lnms_node_id} /></td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.device_name}</td>
                <td className="px-4 py-3"><SevBadge severity={t.severity} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3"><AlarmBadge status={t.alarm_status} source={t.alarm_source} updatedAt={t.last_alarm_update} /></td>
                <td className="px-4 py-3"><SlaBadge sla_status={t.sla_status} used={t.sla_used} total={t.sla_limit_minutes || t.sla_minutes} status={t.status} created_at={t.created_at} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">{fmt(t.created_at).split(',')[0]}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/tickets/${t.id}`); }} className="px-3 py-1 bg-gray-800 text-white text-xs rounded hover:bg-gray-700 shadow-sm">View</button>
                  {t.status === "OPEN" && <button onClick={async (e) => { e.stopPropagation(); await handleAcknowledgeTicket(t.id); load(); }} className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 shadow-sm">ACK</button>}
                  {t.status === "ACK" && <button onClick={async (e) => { e.stopPropagation(); const note = prompt("Enter resolution note") || "Resolved via UI"; await handleResolveTicket(t.id, "Admin", note); load(); }} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 shadow-sm">Resolve</button>}
                  {t.status === "RESOLVED" && <button onClick={async (e) => { e.stopPropagation(); if(confirm("Close this ticket?")) { await handleCloseTicket(t.id); load(); } }} className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 shadow-sm">Close</button>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINATION & ROW CUSTOMIZATION */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm gap-4">
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 font-medium">
            Showing <span className="text-gray-800 font-mono">{(page - 1) * perPage + 1}</span> to <span className="text-gray-800 font-mono">{Math.min(page * perPage, filtered.length)}</span> of <span className="text-blue-600 font-mono font-bold">{filtered.length}</span> tickets
          </div>
          <div className="h-4 w-[1px] bg-gray-200" />
          <div className="flex items-center gap-2">
             <span className="text-[10px] text-gray-400 uppercase tracking-tighter font-bold">Rows Per Page:</span>
             <select 
               value={perPage} 
               onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
               className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs font-mono text-gray-700 outline-none focus:border-blue-500 transition-colors"
             >
               {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
             </select>
          </div>
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setPage(p => Math.max(p - 1, 1))} 
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: pages }, (_, i) => {
                const p = i + 1;
                // Show first, last, and range around current
                if (p === 1 || p === pages || (p >= page - 1 && p <= page + 1)) {
                  return (
                    <button 
                      key={p} 
                      onClick={() => setPage(p)}
                      className={`min-w-[32px] h-8 text-xs font-mono font-bold rounded-lg transition-all ${
                        page === p 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-200 translate-y-[-1px]" 
                          : "text-gray-500 hover:bg-blue-50 hover:text-blue-600"
                      }`}
                    >
                      {p}
                    </button>
                  );
                }
                if (p === 2 || p === pages - 1) return <span key={p} className="text-gray-300 px-1">···</span>;
                return null;
              })}
            </div>

            <button 
              onClick={() => setPage(p => Math.min(p + 1, pages))} 
              disabled={page === pages}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
