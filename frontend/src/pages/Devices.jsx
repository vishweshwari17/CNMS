import { useEffect, useState } from "react";
import { getDevices, getLnmsNodes } from "../api/api";
import { NodeBadge } from "../components/Badges";
import { RefreshCw } from "lucide-react";

export default function Devices() {
  const [devices, setDevices]   = useState([]);
  const [nodes, setNodes]       = useState([]);
  const [search, setSearch]     = useState("");
  const [typeF, setTypeF]       = useState("");
  const [statusF, setStatusF]   = useState("");
  const [lnmsF, setLnmsF]       = useState("ALL");
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const perPage = 10;

  const load = async () => {
    setLoading(true);
    try {
      const [d, n] = await Promise.all([getDevices(), getLnmsNodes()]);
      setDevices(d.data.data || d.data); setNodes(n.data);
    } catch(e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = devices.filter(d =>
    (d.hostname?.toLowerCase().includes(search.toLowerCase()) || d.ip_address?.includes(search)) &&
    (typeF   ? d.device_type === typeF   : true) &&
    (statusF ? d.status === statusF      : true) &&
    (lnmsF !== "ALL" ? d.lnms_node_id === lnmsF : true)
  );
  const pages   = Math.ceil(filtered.length / perPage);
  const visible = filtered.slice((page-1)*perPage, page*perPage);

  const LNMS_COLOR = { "LNMS-MUM-01":"#2563eb","LNMS-BLR-02":"#7c3aed" };

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900">Devices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} devices across {nodes.length} LNMS nodes</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 border border-gray-200 bg-white px-3 py-1.5 rounded-lg">
          <RefreshCw size={14} className={loading?"animate-spin":""}/> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input placeholder="Search hostname or IP" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 w-56"/>
        <select value={typeF} onChange={e=>{setTypeF(e.target.value);setPage(1);}}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">All Types</option>
          {["Router","Switch","Firewall","Server","AP","Other"].map(t=><option key={t}>{t}</option>)}
        </select>
        <select value={statusF} onChange={e=>{setStatusF(e.target.value);setPage(1);}}
          className="border border-gray-200 bg-white rounded-lg px-3 py-1.5 text-sm outline-none">
          <option value="">All Status</option>
          <option>ACTIVE</option><option>INACTIVE</option>
        </select>
        <div className="ml-auto flex gap-1">
          {["ALL",...nodes.map(n=>n.node_id)].map(l=>{
            const c=LNMS_COLOR[l]||"#475569";
            return <button key={l} onClick={()=>{setLnmsF(l);setPage(1);}}
              className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
              style={{color:lnmsF===l?"#fff":c,borderColor:c,background:lnmsF===l?c:"transparent"}}>
              {l==="ALL"?"All Nodes":l}</button>;
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {["ID","Hostname","IP Address","Type","LNMS Node","Location","Status"].map(h=>(
                <th key={h} className="px-4 py-3 text-xs font-semibold text-blue-700 uppercase tracking-wide text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>}
            {!loading && visible.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">No devices found</td></tr>}
            {visible.map(d=>(
              <tr key={d.id} className="hover:bg-blue-50 transition-colors">
                <td className="px-4 py-3 text-xs font-mono text-gray-400">{d.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800 font-mono">{d.hostname}</td>
                <td className="px-4 py-3 text-xs font-mono text-gray-500">{d.ip_address}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded font-medium">{d.device_type}</span>
                </td>
                <td className="px-4 py-3"><NodeBadge nodeId={d.lnms_node_id}/></td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.location}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-semibold border ${d.status==="ACTIVE"?"bg-green-50 text-green-700 border-green-200":"bg-red-50 text-red-700 border-red-200"}`}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex gap-1.5 mt-4">
          {[...Array(pages)].map((_,i)=>(
            <button key={i} onClick={()=>setPage(i+1)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${page===i+1?"bg-blue-600 text-white border-blue-600":"bg-white text-gray-600 border-gray-200 hover:border-blue-400"}`}>
              {i+1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}