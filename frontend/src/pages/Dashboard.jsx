import { useEffect, useState } from "react";
import { getDashboardStats, getLnmsNodes, getTickets } from "../api/api";
import { SevBadge, StatusBadge, NodeBadge, SlaBadge, fmt } from "../components/Badges";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

const SEV_ORDER = ["Critical","Major","Minor","Warning","Info"];
const SEV_COLOR = { Critical:"#dc2626",Major:"#ea580c",Minor:"#ca8a04",Warning:"#2563eb",Info:"#94a3b8" };

export default function Dashboard() {
  const [stats, setStats]   = useState(null);
  const [nodes, setNodes]   = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [s, n, t] = await Promise.all([getDashboardStats(), getLnmsNodes(), getTickets()]);
      setStats(s.data); setNodes(n.data); setTickets(t.data);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tk = stats?.tickets || {};
  const alarmSev = stats?.alarms_by_severity || {};
  const byLnms   = stats?.tickets_by_lnms || {};
  const totalAlarms = Object.values(alarmSev).reduce((a,b)=>a+b,0)||1;
  const totalByLnms = Object.values(byLnms).reduce((a,b)=>a+b,0)||1;

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Network Operations Overview</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={14} className={loading?"animate-spin":""} /> Refresh
        </button>
      </div>

      {/* LNMS Node Status */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {nodes.map(n => (
          <div key={n.node_id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
            <div className={`w-3 h-3 rounded-full shrink-0 ${n.status==="CONNECTED"?"bg-green-400":"bg-red-400"}`}
              style={n.status==="CONNECTED"?{boxShadow:"0 0 8px #4ade80"}:{}} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm font-mono text-gray-800">{n.node_id}</div>
              <div className="text-xs text-gray-400">{n.location} · {n.ip_address}:{n.port}</div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${n.status==="CONNECTED"?"bg-green-50 text-green-700 border-green-200":"bg-red-50 text-red-700 border-red-200"}`}>
              {n.status}
            </span>
          </div>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {[
          {label:"Total Tickets", value:(tk.Open||0)+(tk.ACK||0)+(tk.Closed||0), color:"text-gray-800"},
          {label:"Open",          value:tk.Open||0,   color:"text-blue-600"},
          {label:"ACK",           value:tk.ACK||0,    color:"text-orange-600"},
          {label:"Closed",        value:tk.Closed||0, color:"text-green-600"},
          {label:"Active Alarms", value:stats?.alarms?.Active||0, color:"text-red-600"},
        ].map(k => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-gray-400 font-medium mb-1">{k.label}</div>
            <div className={`text-3xl font-bold font-mono ${k.color}`}>{loading ? "—" : k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Alarms by Severity</div>
          {SEV_ORDER.map(s => {
            const c = alarmSev[s]||0;
            return (
              <div key={s} className="flex items-center gap-3 mb-3">
                <div className="text-xs text-gray-500 w-20 shrink-0">{s}</div>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{width:`${(c/totalAlarms)*100}%`,background:SEV_COLOR[s]}} />
                </div>
                <div className="text-xs font-mono text-gray-500 w-5 text-right">{c}</div>
              </div>
            );
          })}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Tickets by LNMS Node</div>
          {Object.entries(byLnms).map(([node, count]) => (
            <div key={node} className="flex items-center gap-3 mb-3">
              <div className="text-xs font-mono text-gray-500 w-28 shrink-0 truncate">{node}</div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{width:`${(count/totalByLnms)*100}%`,background:node.includes("MUM")?"#2563eb":"#7c3aed"}} />
              </div>
              <div className="text-xs font-mono text-gray-500 w-5 text-right">{count}</div>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="text-xs text-gray-400">TCP messages today: <span className="font-mono font-semibold text-blue-600">{stats?.tcp_messages_today??0}</span></div>
          </div>
        </div>
      </div>

      {/* Recent Tickets */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recent Tickets</h2>
          <button onClick={()=>navigate("/tickets")} className="text-xs text-blue-600 hover:underline">View all →</button>
        </div>
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {["ID","Title","LNMS Node","Device","Severity","Status","SLA","Created"].map(h=>(
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tickets.slice(0,6).map(t => (
              <tr key={t.id} className="hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={()=>navigate(`/tickets/${t.id}`)}>
                <td className="px-4 py-3 text-xs font-mono text-blue-600">{t.short_id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800 max-w-45 truncate">{t.title}</td>
                <td className="px-4 py-3"><NodeBadge nodeId={t.lnms_node_id} /></td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{t.device_name}</td>
                <td className="px-4 py-3"><SevBadge severity={t.severity} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                <td className="px-4 py-3"><SlaBadge used={t.sla_used} total={t.sla_minutes} status={t.status} /></td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">{fmt(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}