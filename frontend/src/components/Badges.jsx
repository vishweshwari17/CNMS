export const SEV_STYLES = {
  Critical: "bg-red-50 text-red-700 border-red-200",
  Major:    "bg-orange-50 text-orange-700 border-orange-200",
  Minor:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  Warning:  "bg-blue-50 text-blue-700 border-blue-200",
  Info:     "bg-gray-50 text-gray-600 border-gray-200",
};
export const SEV_DOT = {
  Critical:"bg-red-500", Major:"bg-orange-500", Minor:"bg-yellow-500", Warning:"bg-blue-500", Info:"bg-gray-400"
};
export const STATUS_STYLES = {
  Open:   "bg-blue-50 text-blue-700 border-blue-200",
  OPEN:   "bg-blue-50 text-blue-700 border-blue-200",
  ACK:    "bg-orange-50 text-orange-700 border-orange-200",
  Closed: "bg-green-50 text-green-700 border-green-200",
  CLOSED: "bg-green-50 text-green-700 border-green-200",
  RESOLVED: "bg-green-50 text-green-700 border-green-200",
};
export const LNMS_COLORS = {
  "LNMS-MUM-01": { text:"text-blue-700",  bg:"bg-blue-50",  border:"border-blue-200"  },
  "LNMS-BLR-02": { text:"text-purple-700",bg:"bg-purple-50",border:"border-purple-200" },
};

export function SevBadge({ severity }) {
  const s = SEV_STYLES[severity] || SEV_STYLES.Info;
  const d = SEV_DOT[severity]    || SEV_DOT.Info;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${s}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d}`} />
      {severity}
    </span>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${s}`}>
      {status}
    </span>
  );
}

export function NodeBadge({ nodeId }) {
  const c = LNMS_COLORS[nodeId] || { text:"text-gray-700", bg:"bg-gray-50", border:"border-gray-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-semibold border ${c.text} ${c.bg} ${c.border}`}>
      {nodeId}
    </span>
  );
}

export function SlaBadge({ sla_status, used, total, status, created_at }) {
  if (status === "CLOSED" || status === "RESOLVED") return <span className="text-xs text-green-600 font-semibold">✓ Done</span>;
  
  const safeTotal = total || 60;
  const safeUsed = used || 0;
  const ratio = Math.min((safeUsed / safeTotal) * 100, 100);
  
  let color = "bg-green-500";
  let statusText = sla_status || "ON_TIME";
  
  if (statusText === "WARNING") color = "bg-yellow-500";
  if (statusText === "BREACHED") color = "bg-red-500";

  return (
    <div className="relative group min-w-24">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
          <span className={`font-bold ${statusText === 'BREACHED' ? 'text-red-600' : 'text-gray-600'}`}>
            {statusText.replace('_', ' ')}
          </span>
          <span className="text-gray-500">{safeUsed}m / {safeTotal}m</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{width: `${ratio}%`}} />
        </div>
      </div>
      <div className="absolute hidden group-hover:block z-10 w-48 bg-gray-900 shadow-lg text-white text-xs rounded p-3 -top-24 left-1/2 -translate-x-1/2">
        <div className="font-semibold text-gray-300 mb-1 border-b border-gray-700 pb-1">SLA Details</div>
        <div className="flex justify-between mt-1"><span>Created:</span> <span>{fmt(created_at).split(',')[1]}</span></div>
        <div className="flex justify-between"><span>SLA Limit:</span> <span>{safeTotal} min</span></div>
        <div className="flex justify-between"><span>Time Used:</span> <span>{safeUsed} min</span></div>
        <div className="flex justify-between text-yellow-300 font-medium"><span>Time Left:</span> <span>{Math.max(safeTotal - safeUsed, 0)} min</span></div>
      </div>
    </div>
  );
}

export function AlarmBadge({ status, source, updatedAt }) {
  if (!status) return <span className="text-xs text-gray-400 font-mono">—</span>;
  
  let bg = "bg-gray-100 text-gray-700 border-gray-200";
  if (status === "PROBLEM") bg = "bg-red-100 text-red-800 border-red-200";
  if (status === "ACTIVE") bg = "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (status === "RESOLVED") bg = "bg-green-100 text-green-800 border-green-200";

  return (
    <div className="relative group inline-block">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm ${bg}`}>
        {status} • {source || 'UNKNOWN'}
      </span>
      <div className="absolute hidden group-hover:block z-20 w-48 bg-gray-900 shadow-lg text-white text-xs rounded p-3 -top-16 left-1/2 -translate-x-1/2">
        <div className="font-semibold text-gray-300 mb-1 border-b border-gray-700 pb-1">Alarm Info</div>
        <div className="flex justify-between mt-1"><span>Source:</span> <span className="font-mono">{source || 'N/A'}</span></div>
        <div className="flex justify-between mt-1 whitespace-nowrap gap-2"><span>Updated:</span> <span>{fmt(updatedAt).split(',')[1] || 'None'}</span></div>
      </div>
    </div>
  );
}

export function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) + ", " +
    d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}