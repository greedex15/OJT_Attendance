import unittest
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import require_student_user
from app.main import (
    admin_update_trainee_profile,
    compute_duration_minutes,
    create_message,
    delete_record,
    list_messages,
    update_record,
)
from app.models import AttendanceRecord, ChatMessage, Student, User
from app.schemas import (
    AttendanceRecordResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ClockInRequest,
    TraineeProfileUpdate,
)


class AttendanceRulesTests(unittest.TestCase):
    def test_attendance_response_serializes_utc_timestamps_with_z(self):
        response = AttendanceRecordResponse(
            id=1,
            student_id="trainee-1",
            student_name="Trainee",
            date=date(2026, 1, 2),
            time_in=datetime.fromisoformat("2026-01-02T06:00:00+08:00"),
            time_out=datetime.fromisoformat("2026-01-02T08:30:00+08:00"),
            duration_minutes=150,
            status="Clocked Out",
            clock_in_supervisor="Supervisor",
            clock_in_signature="data:image/png;base64,signature",
            created_at=datetime.fromisoformat("2026-01-02T06:00:00+08:00"),
            updated_at=datetime.fromisoformat("2026-01-02T08:30:00+08:00"),
        )

        data = response.model_dump(mode="json")

        self.assertEqual(data["time_in"], "2026-01-01T22:00:00Z")
        self.assertEqual(data["time_out"], "2026-01-02T00:30:00Z")
        self.assertTrue(data["created_at"].endswith("Z"))

    def test_duration_uses_timestamp_difference(self):
        start = datetime.fromisoformat("2026-01-02T06:00:00+08:00")
        end = datetime.fromisoformat("2026-01-02T08:30:00+08:00")

        self.assertEqual(compute_duration_minutes(start, end), 150)

    def test_client_time_must_include_a_timezone(self):
        base = {
            "student_id": "trainee-1",
            "supervisor_name": "Supervisor",
            "signature_base64": "data:image/png;base64,12345678901234567890",
        }

        with self.assertRaises(ValidationError):
            ClockInRequest.model_validate({**base, "client_time": "2026-01-02T06:00:00"})

    def test_attendance_update_and_delete_are_forbidden_for_both_roles(self):
        for role in ("user", "admin"):
            account = SimpleNamespace(role=role)
            with self.subTest(role=role, action="update"):
                with self.assertRaises(HTTPException) as error:
                    update_record(1, account)
                self.assertEqual(error.exception.status_code, 403)
            with self.subTest(role=role, action="delete"):
                with self.assertRaises(HTTPException) as error:
                    delete_record(1, account)
                self.assertEqual(error.exception.status_code, 403)

    def test_admin_is_blocked_from_clocking_actions(self):
        with self.assertRaises(HTTPException) as error:
            require_student_user(SimpleNamespace(role="admin"))

        self.assertEqual(error.exception.status_code, 403)

    def test_chat_messages_persist_and_use_authenticated_sender(self):
        engine = create_engine("sqlite://")
        ChatMessage.__table__.create(engine)
        sender = SimpleNamespace(username="coordinator-1", full_name="Alex Coordinator")
        payload = ChatMessageCreate(sender_role="Coordinator", content="  Hello team  ")

        with Session(engine) as db:
            posted = create_message(payload, db, sender)
            self.assertEqual(posted.sender_name, "Alex Coordinator")
            self.assertEqual(posted.sender_username, "coordinator-1")
            self.assertEqual(posted.content, "Hello team")
            self.assertEqual(ChatMessageResponse.model_validate(posted).model_dump(mode="json")["created_at"][-1], "Z")

        with Session(engine) as db:
            messages = list_messages(db, sender)
            self.assertEqual(len(messages), 1)
            self.assertEqual(messages[0].content, "Hello team")

        engine.dispose()

    def test_chat_role_and_message_are_validated(self):
        with self.assertRaises(ValidationError):
            ChatMessageCreate(sender_role="Admin", content="Hello")
        with self.assertRaises(ValidationError):
            ChatMessageCreate(sender_role="Adviser", content="  ")

    def test_admin_can_update_trainee_profile_without_changing_attendance(self):
        engine = create_engine("sqlite://")
        for model in (User, Student, AttendanceRecord):
            model.__table__.create(engine)
        admin = SimpleNamespace(role="admin")
        payload = TraineeProfileUpdate(
            full_name="Updated Trainee",
            course="BSIT",
            school="Example College",
            department="Engineering",
            required_hours=500,
        )

        with Session(engine) as db:
            trainee = User(
                username="trainee-1",
                full_name="Original Trainee",
                role="user",
                password_hash="hash",
                is_active=True,
            )
            student = Student(
                student_id="trainee-1",
                full_name="Original Trainee",
                required_hours=486,
                qr_code_value="trainee-1",
            )
            record = AttendanceRecord(
                student_id="trainee-1",
                student_name="Original Trainee",
                date=date(2026, 1, 1),
                time_in=datetime(2026, 1, 1, 9),
                status="Clocked In",
                clock_in_supervisor="Supervisor",
                clock_in_signature="signature",
            )
            db.add_all((trainee, student, record))
            db.commit()
            record_id = record.id

            updated_profile = admin_update_trainee_profile(trainee.id, payload, db, admin)

            self.assertEqual(updated_profile.full_name, "Updated Trainee")
            self.assertEqual(updated_profile.course, "BSIT")
            self.assertEqual(updated_profile.required_hours, 500)
            self.assertEqual(db.get(User, trainee.id).full_name, "Updated Trainee")
            unchanged_record = db.get(AttendanceRecord, record_id)
            self.assertEqual(unchanged_record.student_name, "Original Trainee")
            self.assertEqual(unchanged_record.time_in, datetime(2026, 1, 1, 9))

        engine.dispose()

    def test_profile_update_creates_missing_trainee_profile(self):
        engine = create_engine("sqlite://")
        User.__table__.create(engine)
        Student.__table__.create(engine)
        admin = SimpleNamespace(role="admin")
        payload = TraineeProfileUpdate(full_name="New Trainee")

        with Session(engine) as db:
            trainee = User(
                username="trainee-2",
                full_name="Old Name",
                role="user",
                password_hash="hash",
                is_active=True,
            )
            db.add(trainee)
            db.commit()

            profile = admin_update_trainee_profile(trainee.id, payload, db, admin)

            self.assertEqual(profile.student_id, "trainee-2")
            self.assertEqual(profile.qr_code_value, "trainee-2")
            self.assertEqual(profile.full_name, "New Trainee")

        engine.dispose()


if __name__ == "__main__":
    unittest.main()
