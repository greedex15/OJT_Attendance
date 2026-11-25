from datetime import date as dt_date
from datetime import datetime, timezone
import base64
import binascii
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


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


def _validate_profile_image(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    mime, separator, payload = value.partition(";base64,")
    if not separator or mime not in {
        "data:image/png",
        "data:image/jpeg",
        "data:image/webp",
    }:
        raise ValueError("Profile image must be a PNG, JPEG, or WebP Base64 data URL.")
    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("Profile image contains invalid Base64 data.") from error
    if not image_bytes or len(image_bytes) > 1_000_000:
        raise ValueError("Profile image must be between 1 byte and 1 MB.")
    if mime == "data:image/png":
        valid_signature = image_bytes.startswith(b"\x89PNG\r\n\x1a\n")
    elif mime == "data:image/jpeg":
        valid_signature = image_bytes.startswith(b"\xff\xd8\xff")
    else:
        valid_signature = image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP"
    if not valid_signature:
        raise ValueError("Profile image data does not match its image type.")
    return value


COURSE_OPTIONS = (
    "BS Information Technology",
    "BS Computer Science",
    "BS Information Systems",
)
MAJOR_OPTIONS = ("Networking and Security", "Web and Mobile App Development")
DEPARTMENT_OPTIONS = (
    "CCSIT",
    "College of Engineering",
    "College of Arts and Sciences",
    "College of Business and Accountancy",
    "College of Education",
    "Other",
)
DEFAULT_SCHOOL = "Isabela State University - Main Echague Campus"
CHAT_ROLES = ("admin", "coordinator", "supervisor", "adviser")
LATE_REASONS = (
    "Traffic",
    "Weather",
    "Health/Appointment",
    "Emergency",
    "Schedule Conflict",
    "Other",
)


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    profile_image: Optional[str] = None

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
    school: str = Field(default=DEFAULT_SCHOOL, max_length=180)
    department: Optional[str] = Field(default="CCSIT", max_length=150)
    gender: Optional[Literal["Male", "Female"]] = None
    major: Optional[Literal["Networking and Security", "Web and Mobile App Development"]] = None
    section: Optional[str] = Field(default=None, max_length=120)
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
        if cleaned not in {"user", *CHAT_ROLES}:
            raise ValueError("Role must be user, admin, coordinator, supervisor, or adviser.")
        return cleaned

    @field_validator("course")
    @classmethod
    def validate_course(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in COURSE_OPTIONS:
            raise ValueError("Choose a course from the available options.")
        return value

    @field_validator("department")
    @classmethod
    def validate_department(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in DEPARTMENT_OPTIONS:
            raise ValueError("Choose a department from the available options.")
        return value

    @field_validator("major")
    @classmethod
    def validate_major(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in MAJOR_OPTIONS:
            raise ValueError("Choose a major from the available options.")
        return value

    @field_validator("school")
    @classmethod
    def set_school(cls, value: str) -> str:
        if value != DEFAULT_SCHOOL:
            raise ValueError(f"School must be {DEFAULT_SCHOOL}.")
        return value

    @model_validator(mode="after")
    def require_trainee_details(self) -> "AdminCreateUserRequest":
        if self.role == "user":
            if not self.course or not self.department or not self.gender or not self.major:
                raise ValueError("Trainees require a course, department, gender, and major.")
        return self


class TraineeProfileUpdate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    course: Optional[str] = Field(default=None, max_length=150)
    school: Optional[str] = Field(default=None, max_length=180)
    department: Optional[str] = Field(default=None, max_length=150)
    gender: Optional[Literal["Male", "Female"]] = None
    major: Optional[Literal["Networking and Security", "Web and Mobile App Development"]] = None
    section: Optional[str] = Field(default=None, max_length=120)
    required_hours: int = Field(default=486, ge=1, le=5000)

    @field_validator("full_name")
    @classmethod
    def strip_profile_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned


class MyProfileUpdate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    profile_image: Optional[str] = Field(default=None, max_length=1_400_000)

    @field_validator("full_name")
    @classmethod
    def strip_profile_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned

    @field_validator("profile_image")
    @classmethod
    def validate_profile_image(cls, value: Optional[str]) -> Optional[str]:
        return _validate_profile_image(value)


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
    gender: Optional[Literal["Male", "Female"]] = None
    major: Optional[str] = Field(default=None, max_length=120)
    section: Optional[str] = Field(default=None, max_length=120)
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
    late_reason: Optional[str] = None
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
    gender: Optional[str] = None
    major: Optional[str] = None
    section: Optional[str] = None
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
    late_reason: Optional[Literal[
        "Traffic",
        "Weather",
        "Health/Appointment",
        "Emergency",
        "Schedule Conflict",
        "Other",
    ]] = None
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


class ChatMessageCreate(BaseModel):
    recipient_username: str = Field(..., min_length=1, max_length=64)
    content: str = Field(..., min_length=1, max_length=4000)

    @field_validator("recipient_username")
    @classmethod
    def normalize_recipient(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if not cleaned:
            raise ValueError("Recipient is required.")
        return cleaned

    @field_validator("content")
    @classmethod
    def strip_content(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Message cannot be blank.")
        return cleaned


class ChatMessageResponse(BaseModel):
    id: int
    sender_username: str
    sender_name: str
    sender_role: str
    recipient_username: Optional[str] = None
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", when_used="json")
    def serialize_created_at(self, value: datetime) -> Optional[str]:
        return _utc_isoformat(value)


class ChatConversationResponse(BaseModel):
    username: str
    full_name: str
    role: str
    profile_image: Optional[str] = None
