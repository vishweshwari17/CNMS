import { useState, useEffect } from "react";

export default function Header({ lnmsNodes = [] }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const connected = lnmsNodes.filter(n => n.status === "CONNECTED").length;

  return (
    <div className="bg-blue-900 text-white px-5 py-0 h-13 flex items-center gap-4 shrink-0 shadow-md z-50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-base font-bold leading-tight">TCS Central Network Management System</div>
        </div>
      </div>

      <div className="w-px h-7 bg-blue-700 mx-1" />

      {/* TCP Status */}
      <div className="flex items-center gap-1.5 bg-blue-800/60 border border-blue-700 rounded-full px-3 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-xs text-blue-200">TCP · {connected}/{lnmsNodes.length} LNMS</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4 text-xs text-blue-200">
        <span>USER: <strong className="text-white">Admin</strong></span>
        <span>NODE ID: <strong className="text-white">001</strong></span>
        <span className="text-blue-300">
          {time.toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}
        </span>
        <span className="font-mono text-blue-200">{time.toLocaleTimeString("en-IN")}</span>
      </div>
    </div>
  );
}