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
  ACK:    "bg-orange-50 text-orange-700 border-orange-200",
  Closed: "bg-green-50 text-green-700 border-green-200",
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

export function SlaBadge({ used, total, status }) {
  if (status === "Closed") return <span className="text-xs text-green-600 font-semibold">✓ Done</span>;
  const ratio = used / total;
  const breached = ratio > 1;
  if (breached) return <span className="text-xs font-bold text-red-600">Breached</span>;
  const color = ratio > 0.8 ? "bg-orange-400" : "bg-green-400";
  return (
    <div className="flex flex-col gap-1 min-w-20">
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{width:`${Math.min(ratio*100,100)}%`}} />
      </div>
      <span className="text-xs text-gray-400 font-mono">{used}m / {total}m</span>
    </div>
  );
}

export function fmt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) + ", " +
    d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}