import json
import os
from contextlib import asynccontextmanager
from datetime import date as dt_date
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_admin,
    require_student_user,
    verify_password,
)
from .database import Base, SessionLocal, engine, get_db, wait_for_db
from .models import AttendanceRecord, ChatMessage, JournalEntry, Student, User
from .schemas import (
    AdminCreateUserRequest,
    AttendanceRecordResponse,
    AuthTokenResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ClockInRequest,
    ClockOutRequest,
    JournalEntryCreate,
    JournalEntryResponse,
    JournalEntryUpdate,
    StudentCreate,
    StudentLookupResponse,
    StudentResponse,
    TraineeProfileUpdate,
    UserLoginRequest,
    UserResponse,
)

DEFAULT_SEED_STUDENTS = [
    {
        "student_id": "23-0679",
        "full_name": "OJT Trainee (23-0679)",
        "course": "BS Information Technology",
        "school": "OJT Partner School",
        "department": "IT / Engineering",
        "required_hours": 486,
        "qr_code_value": "23-0679",
    },
    {
        "student_id": "OJT-2026-001",
        "full_name": "Juan Dela Cruz",
        "course": "BS Information Technology",
        "school": "Polytechnic University",
        "department": "Software Engineering",
        "required_hours": 486,
        "qr_code_value": "OJT-2026-001",
    },
    {
        "student_id": "OJT-2026-002",
        "full_name": "Maria Clara Santos",
        "course": "BS Computer Science",
        "school": "State Institute of Technology",
        "department": "Quality Assurance",
        "required_hours": 486,
        "qr_code_value": "OJT-2026-002",
    },
    {
        "student_id": "OJT-2026-003",
        "full_name": "Rafael Mendoza",
        "course": "BS Information Systems",
        "school": "Metro College",
        "department": "IT Infrastructure",
        "required_hours": 500,
        "qr_code_value": "OJT-2026-003",
    },
]
PHILIPPINE_TIMEZONE = timezone(timedelta(hours=8), "PHT")


def seed_initial_users(db: Session) -> None:
    """Seed default user and admin accounts if missing."""
    default_username = os.getenv("DEFAULT_USER_USERNAME", "23-0679").strip().lower()
    default_password = os.getenv("DEFAULT_USER_PASSWORD", "103013100015")
    default_fullname = os.getenv("DEFAULT_USER_FULLNAME", "OJT User (23-0679)").strip()

    admin_username = os.getenv("DEFAULT_ADMIN_USERNAME", "12-3456").strip().lower()
    admin_password = os.getenv("DEFAULT_ADMIN_PASSWORD", "123456789012")
    admin_fullname = os.getenv("DEFAULT_ADMIN_FULLNAME", "OJT Administrator").strip()

    created = False
    if db.query(User).count() == 0:
        db.add(
            User(
                username=default_username,
                full_name=default_fullname,
                role="user",
                password_hash=hash_password(default_password),
                is_active=True,
            )
        )
        created = True

    if (
        db.query(User).filter(User.role == "admin").count() == 0
        and not db.query(User).filter(User.username == admin_username).first()
    ):
        db.add(
            User(
                username=admin_username,
                full_name=admin_fullname,
                role="admin",
                password_hash=hash_password(admin_password),
                is_active=True,
            )
        )
        created = True

    if created:
        db.commit()


def seed_initial_students(db: Session) -> None:
    """Seed sample OJT trainees on first launch and ensure School ID 23-0679 exists."""
    if db.query(Student).count() == 0:
        for item in DEFAULT_SEED_STUDENTS:
            db.add(Student(**item))
        db.commit()
        return

    primary_seed = DEFAULT_SEED_STUDENTS[0]
    if not db.query(Student).filter(Student.student_id == primary_seed["student_id"]).first():
        db.add(Student(**primary_seed))
        db.commit()


def ensure_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_duration_minutes(time_in: datetime, time_out: Optional[datetime]) -> Optional[int]:
    if not time_out:
        return None
    start = ensure_aware_utc(time_in)
    end = ensure_aware_utc(time_out)
    diff = int((end - start).total_seconds() // 60)
    return max(0, diff)


def migrate_journal_entries() -> None:
    columns = {column["name"] for column in inspect(engine).get_columns("journal_entries")}
    if "what_happened_today" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE journal_entries ADD COLUMN what_happened_today TEXT NOT NULL DEFAULT ''")
            )
            connection.execute(
                text(
                    "UPDATE journal_entries SET what_happened_today = content_html "
                    "WHERE content_html <> ''"
                )
            )
    if "achievements" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE journal_entries ADD COLUMN achievements TEXT NOT NULL DEFAULT ''")
            )


def parse_qr_payload(raw_code: str) -> dict:
    """Support plain student ID strings as well as JSON-encoded QR codes."""
    trimmed = raw_code.strip()
    if trimmed.startswith("{"):
        try:
            data = json.loads(trimmed)
            if isinstance(data, dict):
                sid = str(data.get("student_id") or data.get("id") or "").strip()
                return {
                    "student_id": sid or trimmed,
                    "full_name": data.get("full_name") or data.get("name"),
                    "course": data.get("course"),
                    "department": data.get("department"),
                }
        except json.JSONDecodeError:
            pass
    return {"student_id": trimmed}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    migrate_journal_entries()
    db = SessionLocal()
    try:
        seed_initial_users(db)
        seed_initial_students(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="OJT Attendance System API",
    version="1.2.0",
    description="FastAPI + PostgreSQL backend for QR-based OJT attendance, role-separated access, and supervisor sign-offs.",
    lifespan=lifespan,
)

raw_origins = os.getenv("CORS_ORIGINS", "*").strip()
allowed_origins = ["*"] if raw_origins == "*" else [o.strip() for o in raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


# =========================================================
# Authentication Endpoints
# =========================================================
@app.post("/api/auth/login", response_model=AuthTokenResponse)
def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid School ID or LRN.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is inactive.",
        )

    token = create_access_token(user)
    return AuthTokenResponse(access_token=token, user=user)


@app.get("/api/auth/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


# =========================================================
# Admin-Only User & Trainee Management Endpoints
# =========================================================
@app.get("/api/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    return db.query(User).order_by(User.role.asc(), User.username.asc()).all()


@app.post("/api/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"School ID '{payload.username}' already has a user account.",
        )

    user = User(
        username=payload.username,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)

    # When creating a standard OJT user, also ensure their trainee profile exists for QR attendance
    if payload.role == "user":
        existing_student = (
            db.query(Student)
            .filter(func.lower(Student.student_id) == payload.username)
            .first()
        )
        if not existing_student:
            db.add(
                Student(
                    student_id=payload.username,
                    full_name=payload.full_name,
                    course=payload.course.strip() if payload.course else None,
                    school=payload.school.strip() if payload.school else None,
                    department=payload.department.strip() if payload.department else None,
                    required_hours=payload.required_hours,
                    qr_code_value=payload.username,
                )
            )

    db.commit()
    db.refresh(user)
    return user


@app.put("/api/users/{user_id}/profile", response_model=StudentResponse)
def admin_update_trainee_profile(
    user_id: int,
    payload: TraineeProfileUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id, User.role == "user").first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trainee account not found.",
        )

    student = (
        db.query(Student)
        .filter(func.lower(Student.student_id) == user.username.lower())
        .first()
    )
    if not student:
        qr_owner = (
            db.query(Student)
            .filter(func.lower(Student.qr_code_value) == user.username.lower())
            .first()
        )
        if qr_owner:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This trainee's School ID is already assigned to another QR profile.",
            )
        student = Student(
            student_id=user.username,
            full_name=payload.full_name,
            course=payload.course.strip() if payload.course else None,
            school=payload.school.strip() if payload.school else None,
            department=payload.department.strip() if payload.department else None,
            required_hours=payload.required_hours,
            qr_code_value=user.username,
        )
        db.add(student)

    user.full_name = payload.full_name
    student.full_name = payload.full_name
    student.course = payload.course.strip() if payload.course else None
    student.school = payload.school.strip() if payload.school else None
    student.department = payload.department.strip() if payload.department else None
    student.required_hours = payload.required_hours
    db.commit()
    db.refresh(student)
    return student


# =========================================================
# Student & Attendance Endpoints (Role-Scoped)
# =========================================================
@app.get("/api/students", response_model=List[StudentResponse])
def list_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == "admin":
        return db.query(Student).order_by(Student.student_id.asc()).all()

    return (
        db.query(Student)
        .filter(func.lower(Student.student_id) == current_user.username.lower())
        .all()
    )


@app.post("/api/students", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
def create_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    student_id = payload.student_id.strip()
    qr_val = (payload.qr_code_value or student_id).strip()

    existing = (
        db.query(Student)
        .filter(or_(Student.student_id == student_id, Student.qr_code_value == qr_val))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Student ID or QR code '{student_id}' is already registered.",
        )

    student = Student(
        student_id=student_id,
        full_name=payload.full_name.strip(),
        course=payload.course.strip() if payload.course else None,
        school=payload.school.strip() if payload.school else None,
        department=payload.department.strip() if payload.department else None,
        required_hours=payload.required_hours,
        qr_code_value=qr_val,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@app.get("/api/students/lookup", response_model=StudentLookupResponse)
def lookup_student_by_qr(
    code: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_user),
):
    parsed = parse_qr_payload(code)
    lookup_key = parsed["student_id"]

    student = (
        db.query(Student)
        .filter(
            or_(
                func.lower(Student.qr_code_value) == code.strip().lower(),
                func.lower(Student.qr_code_value) == lookup_key.lower(),
                func.lower(Student.student_id) == lookup_key.lower(),
            )
        )
        .first()
    )

    resolved_id = student.student_id if student else lookup_key

    if resolved_id.lower() != current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only scan and log attendance for their own School ID.",
        )

    active_record = (
        db.query(AttendanceRecord)
        .filter(
            func.lower(AttendanceRecord.student_id) == resolved_id.lower(),
            AttendanceRecord.time_out.is_(None),
        )
        .order_by(AttendanceRecord.time_in.desc())
        .first()
    )

    if student:
        return StudentLookupResponse(
            found_in_directory=True,
            student_id=student.student_id,
            full_name=student.full_name,
            course=student.course,
            school=student.school,
            department=student.department,
            required_hours=student.required_hours,
            active_record=active_record,
        )

    return StudentLookupResponse(
        found_in_directory=True,
        student_id=current_user.username,
        full_name=current_user.full_name,
        course=parsed.get("course"),
        department=parsed.get("department"),
        active_record=active_record,
    )


@app.post("/api/clock-in", response_model=AttendanceRecordResponse, status_code=status.HTTP_201_CREATED)
def clock_in(
    payload: ClockInRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_user),
):
    if payload.student_id.strip().lower() != current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only clock in for their own School ID.",
        )

    student = (
        db.query(Student)
        .filter(
            or_(
                func.lower(Student.student_id) == current_user.username.lower(),
                func.lower(Student.qr_code_value) == current_user.username.lower(),
            )
        )
        .first()
    )

    resolved_student_id = student.student_id if student else current_user.username
    resolved_name = (payload.student_name or "").strip() or (
        student.full_name if student else current_user.full_name
    )

    existing_open = (
        db.query(AttendanceRecord)
        .filter(
            func.lower(AttendanceRecord.student_id) == resolved_student_id.lower(),
            AttendanceRecord.time_out.is_(None),
        )
        .first()
    )
    if existing_open:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{resolved_name} ({resolved_student_id}) is already clocked in.",
        )

    now_utc = ensure_aware_utc(payload.client_time) if payload.client_time else datetime.now(timezone.utc)
    record = AttendanceRecord(
        student_id=resolved_student_id,
        student_name=resolved_name,
        course=(payload.course or (student.course if student else None)),
        department=(payload.department or (student.department if student else None)),
        date=now_utc.astimezone(PHILIPPINE_TIMEZONE).date(),
        time_in=now_utc,
        time_out=None,
        duration_minutes=None,
        status="Clocked In",
        clock_in_supervisor=payload.supervisor_name,
        clock_in_signature=payload.signature_base64,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.post("/api/clock-out", response_model=AttendanceRecordResponse)
def clock_out(
    payload: ClockOutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_user),
):
    query = db.query(AttendanceRecord).filter(AttendanceRecord.time_out.is_(None))
    if payload.record_id is not None:
        record = query.filter(AttendanceRecord.id == payload.record_id).first()
    elif payload.student_id:
        record = (
            query.filter(func.lower(AttendanceRecord.student_id) == payload.student_id.strip().lower())
            .order_by(AttendanceRecord.time_in.desc())
            .first()
        )
    else:
        record = (
            query.filter(func.lower(AttendanceRecord.student_id) == current_user.username.lower())
            .order_by(AttendanceRecord.time_in.desc())
            .first()
        )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active Clocked In session found.",
        )

    if record.student_id.lower() != current_user.username.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users can only clock out their own attendance session.",
        )

    now_utc = ensure_aware_utc(payload.client_time) if payload.client_time else datetime.now(timezone.utc)
    record.time_out = now_utc
    record.duration_minutes = compute_duration_minutes(record.time_in, now_utc)
    record.status = "Clocked Out"
    record.clock_out_supervisor = payload.supervisor_name
    record.clock_out_signature = payload.signature_base64
    if payload.notes is not None and payload.notes.strip():
        existing_notes = (record.notes or "").strip()
        record.notes = f"{existing_notes} | Out: {payload.notes.strip()}" if existing_notes else payload.notes.strip()

    db.commit()
    db.refresh(record)
    return record


@app.get("/api/records", response_model=List[AttendanceRecordResponse])
def get_records(
    search: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    date_from: Optional[dt_date] = Query(default=None),
    date_to: Optional[dt_date] = Query(default=None),
    student_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AttendanceRecord)

    # Non-admin users can only view their own logs
    if current_user.role != "admin":
        query = query.filter(func.lower(AttendanceRecord.student_id) == current_user.username.lower())
    elif student_id and student_id.strip():
        query = query.filter(func.lower(AttendanceRecord.student_id) == student_id.strip().lower())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AttendanceRecord.student_id.ilike(term),
                AttendanceRecord.student_name.ilike(term),
                AttendanceRecord.clock_in_supervisor.ilike(term),
                AttendanceRecord.clock_out_supervisor.ilike(term),
                AttendanceRecord.notes.ilike(term),
            )
        )

    if status_filter and status_filter.lower() in {"clocked in", "in"}:
        query = query.filter(AttendanceRecord.time_out.is_(None))
    elif status_filter and status_filter.lower() in {"clocked out", "out"}:
        query = query.filter(AttendanceRecord.time_out.isnot(None))

    if date_from:
        query = query.filter(AttendanceRecord.date >= date_from)

    if date_to:
        query = query.filter(AttendanceRecord.date <= date_to)

    return query.order_by(AttendanceRecord.time_out.isnot(None), AttendanceRecord.time_in.desc()).all()


@app.put("/api/records/{record_id}")
def update_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Attendance records cannot be updated.",
    )


@app.delete("/api/records/{record_id}")
def delete_record(
    record_id: int,
    current_user: User = Depends(get_current_user),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Attendance records cannot be deleted.",
    )



# =========================================================
# Journal Entry Endpoints
# =========================================================

@app.get("/api/journals", response_model=List[JournalEntryResponse])
def list_journals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return journal entries. Users see only their own; admins see all."""
    q = db.query(JournalEntry)
    if current_user.role != "admin":
        q = q.filter(JournalEntry.owner_username == current_user.username.lower())
    return q.order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc()).all()


@app.post("/api/journals", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
def create_journal(
    payload: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_user),
):
    """Create a new journal entry. Only trainees (role=user) can create entries."""
    entry = JournalEntry(
        owner_username=current_user.username.lower(),
        owner_name=current_user.full_name,
        entry_date=payload.entry_date,
        title=payload.title.strip() if payload.title else "",
        what_happened_today=payload.what_happened_today or payload.content_html or "",
        achievements=payload.achievements or "",
        content_html=payload.what_happened_today or payload.content_html or "",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/api/journals/{journal_id}", response_model=JournalEntryResponse)
def get_journal(
    journal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == journal_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found.")
    if current_user.role != "admin" and entry.owner_username != current_user.username.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return entry


@app.put("/api/journals/{journal_id}", response_model=JournalEntryResponse)
def update_journal(
    journal_id: int,
    payload: JournalEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_student_user),
):
    entry = db.query(JournalEntry).filter(JournalEntry.id == journal_id).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found.")
    if entry.owner_username != current_user.username.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own journal entries.")

    if payload.entry_date is not None:
        entry.entry_date = payload.entry_date
    if payload.title is not None:
        entry.title = payload.title.strip()
    if payload.what_happened_today is not None:
        entry.what_happened_today = payload.what_happened_today
        entry.content_html = payload.what_happened_today
    elif payload.content_html is not None:
        entry.what_happened_today = payload.content_html
        entry.content_html = payload.content_html
    if payload.achievements is not None:
        entry.achievements = payload.achievements

    db.commit()
    db.refresh(entry)
    return entry


# =========================================================
# Shared Chatbox
# =========================================================

@app.get("/api/messages", response_model=List[ChatMessageResponse])
def list_messages(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    messages = (
        db.query(ChatMessage)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(500)
        .all()
    )
    return list(reversed(messages))


@app.post(
    "/api/messages",
    response_model=ChatMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_message(
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    message = ChatMessage(
        sender_username=current_user.username,
        sender_name=current_user.full_name,
        sender_role=payload.sender_role,
        content=payload.content,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message
