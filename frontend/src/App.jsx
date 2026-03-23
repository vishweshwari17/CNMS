import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { getLnmsNodes } from "./api/api";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Alarms from "./pages/Alarms";
import TicketList from "./pages/Tickets";
import Devices from "./pages/Devices";
import { Administration, AuditLogs } from "./pages/AdminPages";
import TicketDetails from "./pages/TicketDetails";
export default function App() {
  const [lnmsNodes, setLnmsNodes] = useState([]);

  useEffect(() => {
    getLnmsNodes().then(r => setLnmsNodes(r.data)).catch(()=>{});

    // WebSocket for real-time push updates
    const wsUrl = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace("http","ws") + "/ws";
    let ws;
    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        console.log("[WS]", data.event, data);
        // Refresh node status on any event
        getLnmsNodes().then(r => setLnmsNodes(r.data)).catch(()=>{});
      };
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    return () => ws?.close();
  }, []);

  return (
    <BrowserRouter>
      <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
        <Header lnmsNodes={lnmsNodes} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar lnmsNodes={lnmsNodes} />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/"                    element={<Dashboard />} />
              <Route path="/alarms"              element={<Alarms />} />
              <Route path="/correlated-alarms"   element={<Alarms correlated />} />
              <Route path="/tickets"             element={<TicketList />} />
              <Route path="/tickets/:id"         element={<TicketDetails />} />
              <Route path="/devices"             element={<Devices />} />
              <Route path="/admin"               element={<Administration />} />
              <Route path="/audit"               element={<AuditLogs />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}