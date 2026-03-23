import { useEffect, useState } from "react";
import { getAlarms, getLnmsNodes } from "../api/api";
import { SevBadge, NodeBadge, fmt } from "../components/Badges";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

export default function Alarms({ correlated = false }) {
  const [alarms, setAlarms]   = useState([]);
  const [nodes, setNodes]     = useState([]);
  const [statusF, setStatusF] = useState("All");
  const [lnmsF, setLnmsF]     = useState("ALL");
  const [sevF, setSevF]       = useState("All");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const [a, n] = await Promise.all([getAlarms(), getLnmsNodes()]);
      setAlarms(a.data); setNodes(n.data);
    } catch(e){ console.error(e); }
    setLoading(false);
  };
  useEffect(()=>{ load(); },[]);

  const filtered = alarms.filter(a => {
    if (statusF !== "All" && a.status !== statusF) return false;
    if (lnmsF !== "ALL"   && a.lnms_node_id !== lnmsF) return false;
    if (sevF  !== "All"   && a.severity !== sevF)  return false;
    if (correlated && !a.alarm_uid?.includes("CORR")) return false;
    return true;
  });

  const LNMS_COLOR = { "LNMS-MUM-01":"#2563eb","LNMS-BLR-02":"#7c3aed" };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">{correlated ? "Correlated Alarms" : "Incoming Alarms"}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live sync from LNMS nodes · {filtered.length} alarms</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={20} className={loading?"animate-spin":""} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1">
          {["All","Active","Resolved"].map(f=>(
            <button key={f} onClick={()=>setStatusF(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${statusF===f?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["All","Critical","Major","Minor","Warning"].map(f=>(
            <button key={f} onClick={()=>setSevF(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${sevF===f?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          {["ALL",...nodes.map(n=>n.node_id)].map(l=>{
            const c = LNMS_COLOR[l]||"#475569";
            return (
              <button key={l} onClick={()=>setLnmsF(l)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
                style={{color:lnmsF===l?"#fff":c,borderColor:c,background:lnmsF===l?c:"transparent"}}>
                {l==="ALL"?"All Nodes":l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {["Alarm ID","LNMS Node","Device","Type","Severity","Status","Raised At","Linked Ticket"].map(h=>(
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
            {!loading && filtered.length===0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">No alarms matching filter</td></tr>}
            {filtered.map(a => (
              <tr key={a.id} className="hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={()=>{ if(a.id) navigate(`/tickets`); }}>
                <td className="px-4 py-3 text-xs font-mono text-blue-600">{a.alarm_uid}</td>
                <td className="px-4 py-3"><NodeBadge nodeId={a.lnms_node_id} /></td>
                <td className="px-4 py-3 text-xs font-mono text-gray-600">{a.device_name}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{a.alarm_type}</td>
                <td className="px-4 py-3"><SevBadge severity={a.severity} /></td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold ${a.status==="Active"?"text-red-600":"text-green-600"}`}>
                    {a.status==="Active"?"● Active":"✓ Resolved"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono whitespace-nowrap">{fmt(a.raised_at)}</td>
                <td className="px-4 py-3 text-xs font-mono text-blue-500">{a.alarm_uid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}