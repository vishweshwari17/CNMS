from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base

class Ticket(Base):

    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True)
    ticket_uid = Column(String(100))
    alarm_id = Column(Integer)
    severity = Column(String(20))
    status = Column(String(20))
    assigned_to = Column(String(100))
    created_at = Column(DateTime)
    resolved_at = Column(DateTime)