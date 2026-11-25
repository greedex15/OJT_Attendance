from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    """Application user account for login and attendance system access."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    role = Column(String(32), nullable=False, default="user")
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Student(Base):
    """Registered OJT student profile linked to a scannable QR code."""

    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(64), unique=True, index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    course = Column(String(150), nullable=True)
    school = Column(String(180), nullable=True)
    department = Column(String(150), nullable=True)
    required_hours = Column(Integer, nullable=False, default=486)
    qr_code_value = Column(String(255), unique=True, index=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AttendanceRecord(Base):
    """OJT Time In / Time Out log with mandatory supervisor Base64 sign-off."""

    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(64), index=True, nullable=False)
    student_name = Column(String(150), nullable=False)
    course = Column(String(150), nullable=True)
    department = Column(String(150), nullable=True)
    date = Column(Date, index=True, nullable=False)
    time_in = Column(DateTime(timezone=True), nullable=False)
    time_out = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="Clocked In")

    clock_in_supervisor = Column(String(150), nullable=False)
    clock_in_signature = Column(Text, nullable=False)

    clock_out_supervisor = Column(String(150), nullable=True)
    clock_out_signature = Column(Text, nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class JournalEntry(Base):
    """Rich-text daily OJT journal entry authored by a trainee."""

    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    # owner: matches User.username (School ID)
    owner_username = Column(String(64), index=True, nullable=False)
    owner_name = Column(String(150), nullable=False)

    entry_date = Column(Date, index=True, nullable=False)
    title = Column(String(255), nullable=False, default="")
    what_happened_today = Column(Text, nullable=False, default="")
    achievements = Column(Text, nullable=False, default="")
    # HTML content produced by TipTap editor
    content_html = Column(Text, nullable=False, default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ChatMessage(Base):
    """Persisted message posted in the shared OJT chatbox."""

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_username = Column(String(64), index=True, nullable=False)
    sender_name = Column(String(150), nullable=False)
    sender_role = Column(String(32), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
