import { useEffect, useState } from "react";
import { getTcpLogs } from "../api/api";
import { RefreshCw, Activity, Terminal } from "lucide-react";

export default function SyncDiagnostics() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getTcpLogs();
      setLogs(res.data);
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
            <Terminal size={24} /> Sync Diagnostics
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time LNMS/SPIC-NMS Sync Events</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
          <RefreshCw size={14} className={loading?"animate-spin":""} /> Poll Updates
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-gray-900 text-green-400 font-mono text-xs flex items-center justify-between">
          <span>LIVE SYNC STREAM</span>
          <div className="flex gap-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> ACTIVE</span>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto font-mono text-[11px]">
          <table className="w-full text-left">
            <thead className="bg-gray-800 text-gray-400 sticky top-0">
              <tr>
                <th className="px-4 py-2">Timestamp</th>
                <th className="px-4 py-2">Node</th>
                <th className="px-4 py-2">Direction</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 text-gray-300 divide-y divide-gray-800">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-gray-850">
                  <td className="px-4 py-2 text-gray-500">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-semibold text-blue-400">{l.lnms_node_id}</td>
                  <td className={`px-4 py-2 ${l.direction==="INBOUND"?"text-orange-400":"text-purple-400"}`}>
                    {l.direction}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{l.msg_type}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded ${l.status==="SUCCESS"?"bg-green-900/30 text-green-400 border border-green-800":"bg-red-900/30 text-red-400 border border-red-800"}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan="5" className="p-10 text-center text-gray-600 italic">No sync events recorded yet...</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
