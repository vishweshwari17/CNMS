import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Bell, Activity, Ticket,
  Server, Settings, ClipboardList,
  ChevronDown, ChevronRight, Menu, Radio
} from "lucide-react";

const LNMS_COLORS = {
  "LNMS-MUM-01": "#2563eb",
  "LNMS-BLR-02": "#7c3aed",
};

export default function Sidebar({ lnmsNodes = [] }) {
  const [collapsed, setCollapsed]   = useState(false);
  const [alarmOpen, setAlarmOpen]   = useState(true);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const NavLink = ({ to, label, Icon, badge }) => (
    <Link to={to} className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-all duration-200
      ${isActive(to) ? "bg-blue-700 text-white" : "text-blue-100 hover:bg-blue-800 hover:text-white"}`}>
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-4.5 text-center">
          {badge}
        </span>
      )}
    </Link>
  );

  const SectionLabel = ({ children }) =>
    !collapsed ? (
      <p className="px-3 mb-2 text-xs font-semibold text-blue-400 uppercase tracking-widest">{children}</p>
    ) : <div className="border-t border-blue-800 my-2 mx-3" />;

  return (
    <div className={`bg-blue-900 text-white min-h-screen shrink-0 flex flex-col transition-all duration-300 ${collapsed ? "w-17" : "w-57.5"}`}>

      {/* Header */}
      <div className={`flex items-center border-b border-blue-800 px-4 py-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div>
            <h1 className="text-base font-bold leading-tight">CNMS</h1>
            <p className="text-xs text-blue-300 leading-tight">Network Operations</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="text-blue-300 hover:text-white transition-colors p-1 rounded">
          <Menu size={20} />
        </button>
      </div>

      <nav className="px-2 py-4 space-y-5 flex-1 overflow-y-auto">

        {/* Overview */}
        <div>
          <SectionLabel>Overview</SectionLabel>
          <NavLink to="/"         label="Dashboard"  Icon={LayoutDashboard} />
        </div>

        {/* Alarm Management */}
        <div>
          <SectionLabel>Alarm Management</SectionLabel>
          <button
            onClick={() => setAlarmOpen(!alarmOpen)}
            className="flex items-center gap-3 w-full px-4 py-2.5 text-blue-100 hover:bg-blue-800 hover:text-white rounded-md text-sm font-medium transition-all duration-200"
          >
            <Bell size={18} className="shrink-0" />
            {!collapsed && <>
              <span className="flex-1 text-left">Alarms</span>
              {alarmOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
            </>}
          </button>
          {alarmOpen && !collapsed && (
            <div className="ml-7 mt-1 space-y-0.5 border-l border-blue-700 pl-3">
              <NavLink to="/alarms"            label="Incoming Alarms"   Icon={Activity} />
              <NavLink to="/correlated-alarms" label="Correlated Alarms" Icon={Activity} />
            </div>
          )}
        </div>

        {/* Ticket Management */}
        <div>
          <SectionLabel>Ticket Management</SectionLabel>
          <NavLink to="/tickets" label="Tickets" Icon={Ticket} />
        </div>

        {/* Infrastructure */}
        <div>
          <SectionLabel>Infrastructure</SectionLabel>
          <NavLink to="/devices" label="Devices"        Icon={Server}        />
          <NavLink to="/admin"   label="Administration" Icon={Settings}      />
          <NavLink to="/audit"   label="Audit Logs"     Icon={ClipboardList} />
        </div>


        {/* Collapsed LNMS dots */}
        {collapsed && lnmsNodes.length > 0 && (
          <div className="flex flex-col items-center gap-2 px-2">
            {lnmsNodes.map(n => (
              <div key={n.node_id} title={`${n.node_id} — ${n.status}`}
                className="w-8 h-8 rounded-full bg-blue-800 border border-blue-600 flex items-center justify-center cursor-default">
                <span className="w-2.5 h-2.5 rounded-full"
                  style={{background: n.status==="CONNECTED" ? "#4ade80" : "#f87171"}} />
              </div>
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}