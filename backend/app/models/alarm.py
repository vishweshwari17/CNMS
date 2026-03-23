from sqlalchemy import Column, BigInteger, String, DateTime, Integer
from sqlalchemy.sql import func
from app.database import Base

class Alarm(Base):
    __tablename__ = "alarms"

    alarm_id = Column(BigInteger, primary_key=True, index=True)

    device_ip = Column(String(50), nullable=False)
    node_name = Column(String(100), nullable=True)

    severity = Column(String(20), nullable=False)   # Critical, Major, Minor
    alarm_type = Column(String(100), nullable=True)

    message = Column(String(500), nullable=True)

    status = Column(String(20), default="Active")   # Active / Cleared

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cleared_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime)
    correlation_id = Column(String(100), nullable=True)