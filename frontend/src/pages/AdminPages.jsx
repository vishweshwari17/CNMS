// ── Administration ────────────────────────────────────────────
import { useEffect, useState } from "react";
import { getLnmsNodes, getAuditLogs, getTcpLog } from "../api/api";
import { NodeBadge, fmt } from "../components/Badges";
import { RefreshCw } from "lucide-react";
export function Administration() {
  const [nodes, setNodes]   = useState([]);
  const [tcpLog, setTcpLog] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [n, t] = await Promise.all([getLnmsNodes(), getTcpLog(20)]);
      setNodes(n.data); setTcpLog(t.data);
    } catch(e){ console.error(e); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Administration</h1>
          <p className="text-sm text-gray-500 mt-0.5">LNMS node configuration and TCP sync status</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh
        </button>
      </div>

      {/* LNMS Node cards */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Connected LNMS Nodes</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        {nodes.map(n=>(
          <div key={n.node_id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold text-gray-800 font-mono text-base">{n.node_id}</div>
                <div className="text-sm text-gray-400">{n.location}</div>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${n.status==="CONNECTED"?"bg-green-50 text-green-700 border-green-200":"bg-red-50 text-red-700 border-red-200"}`}>
                {n.status}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {[["IP Address",n.ip_address],["TCP Port",n.port],["Node ID",n.node_id],["Last Seen",fmt(n.last_seen)]].map(([k,v])=>(
                <div key={k}>
                  <div className="text-gray-400 uppercase tracking-wide font-medium mb-0.5">{k}</div>
                  <div className="font-mono text-gray-700 font-semibold">{v||"—"}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${n.tcp_live?"bg-green-400 animate-pulse":"bg-gray-300"}`}/>
                <span className="text-xs text-gray-500">{n.tcp_live?"Live TCP connection active":"TCP connection inactive"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* TCP Sync Log */}
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">TCP Sync Log (Recent)</h2>
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {["Time","Node","Direction","Msg Type","Status"].map(h=>(
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-sm">Loading…</td></tr>}
            {tcpLog.map(l=>(
              <tr key={l.id} className="hover:bg-blue-50 transition-colors">
                <td className="px-4 py-2.5 text-xs font-mono text-gray-400 whitespace-nowrap">{fmt(l.created_at)}</td>
                <td className="px-4 py-2.5"><NodeBadge nodeId={l.lnms_node_id}/></td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded border font-mono ${l.direction==="INBOUND"?"bg-blue-50 text-blue-700 border-blue-200":"bg-green-50 text-green-700 border-green-200"}`}>
                    {l.direction==="INBOUND"?"← IN":"→ OUT"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{l.msg_type}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-semibold ${l.status==="SUCCESS"?"text-green-600":l.status==="FAILED"?"text-red-600":"text-orange-600"}`}>
                    {l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Audit Logs ────────────────────────────────────────────────
export function AuditLogs() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await getAuditLogs(200); setLogs(r.data); }
    catch(e){ console.error(e); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Audit Logs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track all system activity and user actions</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity History</h2>
          <span className="text-xs text-gray-400">{logs.length} records</span>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {["Time","User","Action","Entity","ID"].map(h=>(
                <th key={h} className="px-5 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
            {!loading && logs.length===0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">No audit logs found</td></tr>}
            {logs.map(log=>(
              <tr key={log.log_id} className="hover:bg-blue-50 transition-colors duration-100">
                <td className="px-5 py-3 text-sm text-gray-500 font-mono whitespace-nowrap">{fmt(log.created_at)}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                    {log.user_name}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-800 font-medium">{log.action}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                    {log.entity_type}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-500 font-mono">#{log.entity_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}