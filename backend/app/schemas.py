from datetime import date as dt_date
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


def _utc_isoformat(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _validate_base64_image(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("Supervisor signature image is required.")
    if not cleaned.startswith("data:image/"):
        raise ValueError("Signature must be a valid Base64 data URL (data:image/...).")
    if ";base64," not in cleaned:
        raise ValueError("Signature must contain Base64 image data.")
    payload = cleaned.split(";base64,", 1)[1]
    if len(payload) < 16:
        raise ValueError("Signature image appears to be empty.")
    return cleaned


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not cleaned:
            raise ValueError("School ID is required.")
        return cleaned


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    full_name: str = Field(..., min_length=2, max_length=150)
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not cleaned or " " in cleaned:
            raise ValueError("School ID cannot be empty or contain spaces.")
        return cleaned

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned


class AdminCreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    full_name: str = Field(..., min_length=2, max_length=150)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field(default="user")
    course: Optional[str] = Field(default=None, max_length=150)
    school: Optional[str] = Field(default=None, max_length=180)
    department: Optional[str] = Field(default=None, max_length=150)
    required_hours: int = Field(default=486, ge=1, le=5000)

    @field_validator("username")
    @classmethod
    def normalize_admin_username(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not cleaned or " " in cleaned:
            raise ValueError("School ID cannot be empty or contain spaces.")
        return cleaned

    @field_validator("full_name")
    @classmethod
    def strip_admin_full_name(cls, v: str) -> str:
        cleaned = v.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in {"user", "admin"}:
            raise ValueError("Role must be either 'user' or 'admin'.")
        return cleaned


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class StudentBase(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    full_name: str = Field(..., min_length=2, max_length=150)
    course: Optional[str] = Field(default=None, max_length=150)
    school: Optional[str] = Field(default=None, max_length=180)
    department: Optional[str] = Field(default=None, max_length=150)
    required_hours: int = Field(default=486, ge=1, le=5000)


class StudentCreate(StudentBase):
    qr_code_value: Optional[str] = Field(default=None, max_length=255)


class StudentResponse(StudentBase):
    id: int
    qr_code_value: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttendanceRecordResponse(BaseModel):
    id: int
    student_id: str
    student_name: str
    course: Optional[str] = None
    department: Optional[str] = None
    date: dt_date
    time_in: datetime
    time_out: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    status: str
    clock_in_supervisor: str
    clock_in_signature: str
    clock_out_supervisor: Optional[str] = None
    clock_out_signature: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("time_in", "time_out", "created_at", "updated_at", when_used="json")
    def serialize_attendance_times(self, value: Optional[datetime]) -> Optional[str]:
        return _utc_isoformat(value)


class StudentLookupResponse(BaseModel):
    found_in_directory: bool
    student_id: str
    full_name: Optional[str] = None
    course: Optional[str] = None
    school: Optional[str] = None
    department: Optional[str] = None
    required_hours: Optional[int] = None
    active_record: Optional[AttendanceRecordResponse] = None


class ClockInRequest(BaseModel):
    student_id: str = Field(..., min_length=1, max_length=64)
    student_name: Optional[str] = Field(default=None, max_length=150)
    course: Optional[str] = Field(default=None, max_length=150)
    department: Optional[str] = Field(default=None, max_length=150)
    supervisor_name: str = Field(..., min_length=2, max_length=150)
    signature_base64: str
    notes: Optional[str] = Field(default=None, max_length=500)
    client_time: Optional[datetime] = None

    @field_validator("student_id", "supervisor_name")
    @classmethod
    def strip_required(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("signature_base64")
    @classmethod
    def check_signature(cls, v: str) -> str:
        return _validate_base64_image(v)

    @field_validator("client_time")
    @classmethod
    def require_aware_client_time(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is not None and value.utcoffset() is None:
            raise ValueError("Client time must include a timezone.")
        return value.astimezone(timezone.utc) if value is not None else None


class ClockOutRequest(BaseModel):
    student_id: Optional[str] = Field(default=None, max_length=64)
    record_id: Optional[int] = None
    supervisor_name: str = Field(..., min_length=2, max_length=150)
    signature_base64: str
    notes: Optional[str] = Field(default=None, max_length=500)
    client_time: Optional[datetime] = None

    @field_validator("supervisor_name")
    @classmethod
    def strip_supervisor(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Supervisor name cannot be blank.")
        return cleaned

    @field_validator("signature_base64")
    @classmethod
    def check_signature(cls, v: str) -> str:
        return _validate_base64_image(v)

    @field_validator("client_time")
    @classmethod
    def require_aware_client_time(cls, value: Optional[datetime]) -> Optional[datetime]:
        if value is not None and value.utcoffset() is None:
            raise ValueError("Client time must include a timezone.")
        return value.astimezone(timezone.utc) if value is not None else None


class JournalEntryCreate(BaseModel):
    entry_date: dt_date
    title: str = Field(default="", max_length=255)
    what_happened_today: str = Field(default="")
    achievements: str = Field(default="")
    content_html: Optional[str] = None


class JournalEntryUpdate(BaseModel):
    entry_date: Optional[dt_date] = None
    title: Optional[str] = Field(default=None, max_length=255)
    what_happened_today: Optional[str] = None
    achievements: Optional[str] = None
    content_html: Optional[str] = None


class JournalEntryResponse(BaseModel):
    id: int
    owner_username: str
    owner_name: str
    entry_date: dt_date
    title: str
    what_happened_today: str
    achievements: str
    content_html: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", "updated_at", when_used="json")
    def serialize_timestamps(self, value: datetime) -> Optional[str]:
        return _utc_isoformat(value)
