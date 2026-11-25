import React, { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { CheckCircle2, Eraser, PenTool, ShieldCheck, X } from "lucide-react";

export default function SignatureModal({
  isOpen,
  mode,
  studentData,
  onClose,
  onSubmit,
  isSubmitting = false,
}) {
  const sigPadRef = useRef(null);

  const [studentName, setStudentName] = useState("");
  const [course, setCourse] = useState("");
  const [department, setDepartment] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (isOpen && studentData) {
      setStudentName(studentData.full_name || "");
      setCourse(studentData.course || "");
      setDepartment(studentData.department || "");
      setSupervisorName("");
      setNotes("");
      setError("");
      setHasDrawn(false);
      setTimeout(() => {
        sigPadRef.current?.clear();
      }, 0);
    }
  }, [isOpen, studentData]);

  if (!isOpen || !studentData) return null;

  const isClockOut = mode === "clock-out";

  function handleClearSignature() {
    sigPadRef.current?.clear();
    setHasDrawn(false);
    setError("");
  }

  function extractBase64Png() {
    if (!sigPadRef.current) return "";
    try {
      return sigPadRef.current.getTrimmedCanvas().toDataURL("image/png");
    } catch {
      return sigPadRef.current.getCanvas().toDataURL("image/png");
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!isClockOut && !studentName.trim()) {
      setError("Student full name is required.");
      return;
    }

    if (supervisorName.trim().length < 2) {
      setError("Please enter the verifying supervisor's full name.");
      return;
    }

    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setError("Supervisor signature is required before submitting.");
      return;
    }

    const signatureBase64 = extractBase64Png();
    if (!signatureBase64.startsWith("data:image/")) {
      setError("Could not capture signature image. Please draw again.");
      return;
    }

    onSubmit({
      student_id: studentData.student_id,
      student_name: studentName.trim(),
      course: course.trim() || null,
      department: department.trim() || null,
      record_id: studentData.active_record?.id || null,
      supervisor_name: supervisorName.trim(),
      signature_base64: signatureBase64,
      notes: notes.trim() || null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signature-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isClockOut ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <ShieldCheck
              className={`w-5 h-5 ${
                isClockOut ? "text-amber-600" : "text-emerald-600"
              }`}
            />
            <div>
              <h3
                id="signature-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Supervisor Verification &mdash; {isClockOut ? "Clock Out" : "Clock In"}
              </h3>
              <p className="text-xs text-slate-600">
                Mandatory sign-off required to record OJT attendance
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-white/70 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Student Summary Banner */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                {studentData.student_id}
              </span>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  isClockOut
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
                }`}
              >
                {isClockOut ? "Active Shift Found → Clock Out" : "New Shift → Clock In"}
              </span>
            </div>

            {studentData.found_in_directory ? (
              <div className="mt-2">
                <div className="font-semibold text-slate-900">{studentData.full_name}</div>
                <div className="text-xs text-slate-500">
                  {[studentData.course, studentData.department].filter(Boolean).join(" • ") ||
                    "Registered OJT Trainee"}
                </div>
              </div>
            ) : (
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Enter student name (not yet in directory)"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Course (optional)
                  </label>
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="e.g. BSIT"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Department (optional)
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. IT Dept"
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Supervisor Name */}
          <div>
            <label
              htmlFor="supervisor-name-input"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
            >
              Supervisor Name *
            </label>
            <input
              id="supervisor-name-input"
              type="text"
              required
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              placeholder="e.g. Engr. Elena Reyes"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Signature Pad */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <PenTool className="w-3.5 h-3.5" />
                Supervisor Digital Signature *
              </label>
              <button
                type="button"
                onClick={handleClearSignature}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-rose-600 transition"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear Pad
              </button>
            </div>

            <div className="relative rounded-xl border-2 border-slate-300 bg-white overflow-hidden">
              <SignatureCanvas
                ref={sigPadRef}
                penColor="#0f172a"
                onEnd={() => setHasDrawn(true)}
                canvasProps={{
                  width: 460,
                  height: 170,
                  className: "w-full h-[170px] cursor-crosshair touch-none",
                }}
              />
              {!hasDrawn && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                  Sign inside this box with mouse or touch
                </div>
              )}
            </div>
          </div>

          {/* Optional Journal Notes */}
          <div>
            <label
              htmlFor="shift-notes-input"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
            >
              Daily Journal / Task Notes (optional)
            </label>
            <textarea
              id="shift-notes-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Assisted with database backup and UI testing"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 ${
                isClockOut
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting
                ? "Saving..."
                : isClockOut
                ? "Verify & Clock Out"
                : "Verify & Clock In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
