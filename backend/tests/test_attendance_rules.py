import unittest
from datetime import date, datetime
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError

from app.auth import require_student_user
from app.main import compute_duration_minutes, delete_record, update_record
from app.schemas import AttendanceRecordResponse, ClockInRequest


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


if __name__ == "__main__":
    unittest.main()
