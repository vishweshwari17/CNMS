import { useEffect, useState } from "react";
import { Activity, TrendingUp, AlertTriangle, Zap } from "lucide-react";

export default function TrendAnalysis() {
  // Placeholder data for trends
  const trends = [
    { day: "Mon", volume: 12, resolved: 10 },
    { day: "Tue", volume: 19, resolved: 15 },
    { day: "Wed", volume: 32, resolved: 28 }, // Hotspot detected
    { day: "Thu", volume: 22, resolved: 20 },
    { day: "Fri", volume: 45, resolved: 40 }, // Peak workload
  ];

  const hotspots = [
    { node: "LNMS-LOCAL-01", issue: "Recurring Link Flaps", count: 14, severity: "High" },
    { node: "LNMS-COMPANY-01", issue: "SLA Breaches", count: 3, severity: "Critical" },
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-blue-900 flex items-center gap-2">
            <TrendingUp size={24} /> Trend Analysis & Predictions
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Predictive Insights & Historical Patterns</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="col-span-2 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Activity size={14} /> Weekly Ticket Volume vs Resolution
          </h2>
          <div className="flex items-end gap-10 h-48 justify-around">
            {trends.map(t => (
              <div key={t.day} className="flex flex-col items-center flex-1">
                <div className="w-full flex gap-1 justify-center">
                   <div className="w-3 bg-blue-100 rounded-t" style={{height: `${t.volume*3}px`}} />
                   <div className="w-3 bg-blue-500 rounded-t" style={{height: `${t.resolved*3}px`}} />
                </div>
                <span className="text-[10px] text-gray-400 mt-2 font-mono">{t.day}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 flex gap-4 text-[10px] font-mono justify-center">
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-100 rounded"/> VOLUME</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded"/> RESOLVED</span>
          </div>
        </div>

        <div className="space-y-4">
           <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-xs font-bold text-gray-800 uppercase flex items-center gap-2"><Zap size={14} className="text-orange-500"/> Predictions</h3>
             </div>
             <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
               <p className="text-[11px] text-orange-800 font-medium">Expected Peak: Friday 14:00 - 16:00</p>
               <p className="text-[10px] text-orange-600 mt-1">Based on historical 4-week average.</p>
             </div>
           </div>
           
           <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
             <h3 className="text-xs font-bold text-gray-800 uppercase mb-4 flex items-center gap-2"><AlertTriangle size={14} className="text-red-500"/> Hotspots</h3>
             <div className="space-y-3">
               {hotspots.map(h => (
                 <div key={h.node} className="border-b border-gray-50 pb-2 last:border-0">
                   <div className="flex justify-between text-[11px] font-semibold text-gray-700">
                     <span>{h.node}</span>
                     <span className="text-red-600">{h.severity}</span>
                   </div>
                   <div className="text-[10px] text-gray-400 mt-0.5">{h.issue} ({h.count} hits)</div>
                 </div>
               ))}
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
