import React from "react";
import { LogOut } from "lucide-react";
import { parseAttendanceTimestamp } from "../utils/time.js";

function formatDateTime(isoStr) {
  if (!isoStr) return "—";
  const date = parseAttendanceTimestamp(isoStr);
  if (!date) return isoStr;
  const local = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const philippines = date.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
  return `${local} (local) · ${philippines} PHT`;
}

function formatDuration(timeIn, timeOut) {
  const start = parseAttendanceTimestamp(timeIn)?.getTime();
  const end = timeOut ? parseAttendanceTimestamp(timeOut)?.getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m${timeOut ? "" : " (live)"}`;
}

export default function AttendanceTable({
  records,
  loading,
  isAdmin = false,
  onClockOutClick,
  onPreviewSignature,
}) {
  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading attendance records...</div>;
  }

  if (!records?.length) {
    return (
      <div className="p-12 text-center">
        <p className="text-sm font-semibold text-slate-800">No attendance records found</p>
        <p className="text-xs text-slate-500 mt-1">
          {isAdmin
            ? "Trainee attendance logs will appear here once trainees clock in."
            : "Use the QR Scanner or My QR Code above to record your attendance."}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <th className="py-3 px-4">Student ID</th>
            <th className="py-3 px-4">Trainee Name</th>
            <th className="py-3 px-4">Date</th>
            <th className="py-3 px-4">Time In</th>
            <th className="py-3 px-4">Time Out</th>
            <th className="py-3 px-4">Duration</th>
            <th className="py-3 px-4">Status</th>
            <th className="py-3 px-4">Supervisor Sign-Off</th>
            <th className="py-3 px-4">Journal</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-sm">
          {records.map((record) => {
            const active = !record.time_out;
            return (
              <tr key={record.id} className="hover:bg-slate-50/80">
                <td className="py-3 px-4 font-mono text-xs">{record.student_id}</td>
                <td className="py-3 px-4">
                  <div className="font-semibold">{record.student_name}</div>
                  <div className="text-xs text-slate-500">{[record.course, record.department].filter(Boolean).join(" · ")}</div>
                </td>
                <td className="py-3 px-4 whitespace-nowrap">{record.date}</td>
                <td className="py-3 px-4 whitespace-nowrap" title={formatDateTime(record.time_in)}>{formatDateTime(record.time_in)}</td>
                <td className="py-3 px-4 whitespace-nowrap" title={record.time_out ? formatDateTime(record.time_out) : ""}>
                  {record.time_out ? formatDateTime(record.time_out) : "—"}
                </td>
                <td className="py-3 px-4 whitespace-nowrap">{formatDuration(record.time_in, record.time_out)}</td>
                <td className="py-3 px-4">{record.status}</td>
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    {[["In", record.clock_in_supervisor, record.clock_in_signature, record.time_in], ["Out", record.clock_out_supervisor, record.clock_out_signature, record.time_out]]
                      .filter(([, supervisor]) => supervisor)
                      .map(([label, supervisor, signature, timestamp]) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{label}: {supervisor}</span>
                          {signature && onPreviewSignature && (
                            <button
                              type="button"
                              onClick={() => onPreviewSignature({
                                title: `Clock-${label} Signature (${record.student_name})`,
                                supervisor,
                                signature,
                                timestamp: formatDateTime(timestamp),
                              })}
                              title={`View Clock-${label} Signature`}
                              className="border border-slate-200 rounded bg-white p-0.5"
                            >
                              <img src={signature} alt={`Signature of ${supervisor}`} className="h-6 w-14 object-contain" />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                </td>
                <td className="py-3 px-4 text-xs whitespace-pre-wrap">{record.notes || "—"}</td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  {!isAdmin && active && onClockOutClick && (
                    <button
                      type="button"
                      onClick={() => onClockOutClick(record)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Clock Out
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
