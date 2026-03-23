# app/models/schemas.py
"""
Pydantic response models — Python 3.9 compatible.
Uses typing.Optional / List / Dict (not X|None / list[X] / dict[X,Y]).
Every field name matches what the React frontend reads directly.
"""
from datetime import datetime
from typing import Dict, List, Optional
from pydantic import BaseModel


# ── LNMS Nodes ───────────────────────────────────────────────
class LnmsNode(BaseModel):
    id: int
    node_id: str
    display_name: str
    ip_address: str
    port: int
    location: Optional[str] = None
    status: str                         # "CONNECTED" | "DISCONNECTED"
    tcp_live: bool                      # frontend: n.tcp_live
    last_seen: Optional[datetime] = None


# ── Alarms ───────────────────────────────────────────────────
class Alarm(BaseModel):
    id: int
    alarm_uid: str
    lnms_node_id: str
    device_name: Optional[str] = None   # frontend: a.device_name
    alarm_type: str
    severity: str
    status: str
    raised_at: datetime                 # frontend: a.raised_at
    resolved_at: Optional[datetime] = None


# ── Devices ──────────────────────────────────────────────────
class Device(BaseModel):
    id: int
    lnms_node_id: str
    hostname: str
    ip_address: str
    device_type: str
    location: Optional[str] = None
    status: str


# ── Ticket Message ───────────────────────────────────────────
class TicketMessage(BaseModel):
    id: int
    ticket_id: int
    sender: str                         # "LNMS-MUM-01" or "CNMS"
    msg_type: str
    body: Optional[str] = None          # frontend: msg.body
    sent_at: datetime                   # frontend: msg.sent_at
    is_resolved: bool                   # frontend: msg.is_resolved


# ── Ticket list view ─────────────────────────────────────────
class Ticket(BaseModel):
    id: int                             # frontend: /tickets/{t.id}
    short_id: str                       # frontend: t.short_id
    ticket_uid: str
    alarm_uid: str
    lnms_node_id: str
    device_name: Optional[str] = None   # frontend: t.device_name
    title: str
    severity: str
    status: str
    sla_minutes: int
    sla_used: int                       # frontend: t.sla_used
    created_at: datetime
    updated_at: datetime


# ── Ticket detail ────────────────────────────────────────────
class TicketDetail(Ticket):
    description: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None
    messages: List[TicketMessage] = []


# ── Dashboard stats ──────────────────────────────────────────
class DashboardStats(BaseModel):
    tickets: Dict[str, int]              # {"Open":3,"ACK":1,"Closed":10}
    alarms: Dict[str, int]               # {"Active":5,"Resolved":20}
    alarms_by_severity: Dict[str, int]   # {"Critical":2,"Major":1,...}
    tickets_by_lnms: Dict[str, int]      # {"LNMS-MUM-01":4,...}
    tcp_messages_today: int


# ── TCP sync log ─────────────────────────────────────────────
class TcpLogEntry(BaseModel):
    id: int
    lnms_node_id: str
    direction: str                       # "INBOUND" | "OUTBOUND"
    msg_type: str
    status: str                          # "SUCCESS" | "FAILED" | "PENDING"
    created_at: datetime


# ── Audit log ────────────────────────────────────────────────
class AuditLogEntry(BaseModel):
    log_id: int                          # frontend: log.log_id
    user_name: str
    action: str
    entity_type: str
    entity_id: str
    created_at: datetime


# ── Request bodies ───────────────────────────────────────────
class CommentBody(BaseModel):
    body: str                            # frontend: { body, user }
    user: str = "Admin"


class ResolveBody(BaseModel):
    resolution_note: str
    resolved_by: str = "Admin"