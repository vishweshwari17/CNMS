from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base

class TicketMessage(Base):

    __tablename__ = "ticket_messages"

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer)
    sender = Column(String(50))
    message = Column(String)
    created_at = Column(DateTime)