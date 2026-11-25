import unittest
import base64
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.auth import require_chat_user, require_student_user
from app.main import app, migrate_added_columns, update_my_profile
from app.main import (
    admin_update_trainee_profile,
    compute_duration_minutes,
    create_message,
    delete_record,
    get_journal,
    get_records,
    list_journals,
    list_conversations,
    list_students,
    list_messages,
    update_record,
)
from app.models import AttendanceRecord, ChatMessage, JournalEntry, Student, User
from app.schemas import (
    AdminCreateUserRequest,
    AttendanceRecordResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ClockInRequest,
    MyProfileUpdate,
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

    def test_staff_roles_trainee_fields_and_late_reasons_are_validated(self):
        account = AdminCreateUserRequest(
            username="staff-1",
            full_name="Staff Member",
            password="secret1",
            role="Adviser",
        )
        self.assertEqual(account.role, "adviser")
        trainee = AdminCreateUserRequest(
            username="trainee-0",
            full_name="Trainee",
            password="secret1",
            course="BS Information Technology",
            department="CCSIT",
            gender="Female",
            major="Networking and Security",
        )
        self.assertEqual(trainee.school, "Isabela State University - Main Echague Campus")
        self.assertEqual(trainee.major, "Networking and Security")
        with self.assertRaises(ValidationError):
            AdminCreateUserRequest(
                username="trainee-missing",
                full_name="Trainee",
                password="secret1",
            )
        with self.assertRaises(ValidationError):
            AdminCreateUserRequest(
                username="trainee-1",
                full_name="Trainee",
                password="secret1",
                course="Unlisted Course",
                major="Networking and Security",
                department="CCSIT",
                gender="Female",
            )
        with self.assertRaises(ValidationError):
            AdminCreateUserRequest(
                username="trainee-3",
                full_name="Trainee",
                password="secret1",
                course="BS Information Technology",
                major="Unlisted Major",
                department="CCSIT",
                gender="Female",
            )
        with self.assertRaises(ValidationError):
            AdminCreateUserRequest(
                username="trainee-2",
                full_name="Trainee",
                password="secret1",
                school="Different School",
            )
        with self.assertRaises(ValidationError):
            ClockInRequest(
                student_id="trainee-1",
                supervisor_name="Supervisor",
                signature_base64="data:image/png;base64,12345678901234567890",
                late_reason="Not a reason",
            )

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

    def test_direct_chat_messages_are_persisted_and_private_to_the_pair(self):
        engine = create_engine("sqlite://")
        for model in (User,):
            model.__table__.create(engine)
        ChatMessage.__table__.create(engine)

        with Session(engine) as db:
            sender = User(username="coordinator-1", full_name="Alex Coordinator", role="coordinator", password_hash="hash")
            peer = User(username="supervisor-1", full_name="Sam Supervisor", role="supervisor", password_hash="hash")
            other = User(username="adviser-1", full_name="Ari Adviser", role="adviser", password_hash="hash")
            db.add_all((sender, peer, other))
            db.commit()
            payload = ChatMessageCreate(recipient_username=" SUPERVISOR-1 ", content="  Hello directly  ")
            posted = create_message(payload, db, sender)
            self.assertEqual(posted.sender_name, "Alex Coordinator")
            self.assertEqual(posted.sender_username, "coordinator-1")
            self.assertEqual(posted.sender_role, "coordinator")
            self.assertEqual(posted.recipient_username, "supervisor-1")
            self.assertEqual(posted.content, "Hello directly")
            self.assertEqual(ChatMessageResponse.model_validate(posted).model_dump(mode="json")["created_at"][-1], "Z")

            messages = list_messages("supervisor-1", db, sender)
            self.assertEqual(len(messages), 1)
            self.assertEqual(messages[0].content, "Hello directly")
            self.assertEqual(len(list_messages("adviser-1", db, sender)), 0)
            self.assertEqual(len(list_conversations(db, sender)), 2)

        engine.dispose()

    def test_chat_recipient_and_message_are_validated_and_trainees_are_denied(self):
        with self.assertRaises(ValidationError):
            ChatMessageCreate(recipient_username="  ", content="Hello")
        with self.assertRaises(ValidationError):
            ChatMessageCreate(recipient_username="coordinator", content="  ")
        with self.assertRaises(HTTPException) as error:
            require_chat_user(SimpleNamespace(role="user"))
        self.assertEqual(error.exception.status_code, 403)

    def test_role_rules_only_allow_users_to_take_trainee_actions(self):
        require_student_user(SimpleNamespace(role="user"))
        for role in ("admin", "coordinator", "supervisor", "adviser"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as error:
                require_student_user(SimpleNamespace(role=role))
            self.assertEqual(error.exception.status_code, 403)

    def test_admin_cannot_list_or_open_journals(self):
        engine = create_engine("sqlite://")
        JournalEntry.__table__.create(engine)
        admin = SimpleNamespace(role="admin", username="admin-1")

        with Session(engine) as db:
            with self.assertRaises(HTTPException) as error:
                list_journals(db, admin)
            self.assertEqual(error.exception.status_code, 403)

            entry = JournalEntry(
                owner_username="trainee-1",
                owner_name="Trainee",
                entry_date=date(2026, 1, 1),
            )
            db.add(entry)
            db.commit()
            with self.assertRaises(HTTPException) as error:
                get_journal(entry.id, db, admin)
            self.assertEqual(error.exception.status_code, 403)

        with self.assertRaises(HTTPException) as error:
            require_student_user(admin)
        self.assertEqual(error.exception.status_code, 403)
        engine.dispose()

    def test_attendance_monitoring_is_limited_to_admins_and_advisers(self):
        engine = create_engine("sqlite://")
        AttendanceRecord.__table__.create(engine)
        with Session(engine) as db:
            db.add_all(
                [
                    AttendanceRecord(
                        student_id=student_id,
                        student_name=student_id,
                        date=date(2026, 1, 1),
                        time_in=datetime(2026, 1, 1, 9),
                        status="Clocked In",
                        clock_in_supervisor="Supervisor",
                        clock_in_signature="signature",
                    )
                    for student_id in ("trainee-1", "trainee-2")
                ]
            )
            db.commit()
            own_records = get_records(
                search=None,
                status_filter=None,
                date_from=None,
                date_to=None,
                student_id=None,
                db=db,
                current_user=SimpleNamespace(role="user", username="trainee-1"),
            )
            adviser_records = get_records(
                search=None,
                status_filter=None,
                date_from=None,
                date_to=None,
                student_id=None,
                db=db,
                current_user=SimpleNamespace(role="adviser", username="adviser-1"),
            )
            self.assertEqual([record.student_id for record in own_records], ["trainee-1"])
            self.assertEqual(len(adviser_records), 2)

            with self.assertRaises(HTTPException) as error:
                list_students(db, SimpleNamespace(role="coordinator", username="coordinator-1"))
            self.assertEqual(error.exception.status_code, 403)
            with self.assertRaises(HTTPException) as error:
                get_records(
                    search=None,
                    status_filter=None,
                    date_from=None,
                    date_to=None,
                    student_id=None,
                    db=db,
                    current_user=SimpleNamespace(role="supervisor", username="supervisor-1"),
                )
            self.assertEqual(error.exception.status_code, 403)

        engine.dispose()

    def test_self_profile_update_saves_image_and_keeps_attendance_immutable(self):
        self.assertIn("/api/users/me", app.openapi()["paths"])
        engine = create_engine("sqlite://")
        for model in (User, Student, AttendanceRecord):
            model.__table__.create(engine)
        image = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n").decode("ascii")
        payload = MyProfileUpdate(full_name="New Display Name", profile_image=image)

        with Session(engine) as db:
            user = User(username="trainee-1", full_name="Old Name", role="user", password_hash="hash")
            student = Student(
                student_id="trainee-1",
                full_name="Old Name",
                qr_code_value="trainee-1",
                required_hours=486,
            )
            record = AttendanceRecord(
                student_id="trainee-1",
                student_name="Old Name",
                date=date(2026, 1, 1),
                time_in=datetime(2026, 1, 1, 9),
                status="Clocked In",
                clock_in_supervisor="Supervisor",
                clock_in_signature="signature",
            )
            db.add_all((user, student, record))
            db.commit()
            original_record_id = record.id

            updated = update_my_profile(payload, db, user)
            self.assertEqual(updated.full_name, "New Display Name")
            self.assertEqual(updated.profile_image, image)
            self.assertEqual(db.get(Student, student.id).full_name, "New Display Name")
            self.assertEqual(db.get(AttendanceRecord, original_record_id).student_name, "Old Name")

        engine.dispose()

    def test_existing_database_columns_are_migrated(self):
        engine = create_engine("sqlite://")
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE students (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE attendance_records (id INTEGER PRIMARY KEY)")
            connection.exec_driver_sql("CREATE TABLE chat_messages (id INTEGER PRIMARY KEY)")

        with patch("app.main.engine", engine):
            migrate_added_columns()

        expected = {
            "users": {"profile_image"},
            "students": {"gender", "major", "section"},
            "attendance_records": {"late_reason"},
            "chat_messages": {"recipient_username"},
        }
        for table, columns in expected.items():
            with self.subTest(table=table):
                actual = {column["name"] for column in inspect(engine).get_columns(table)}
                self.assertTrue(columns.issubset(actual))
        engine.dispose()

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
