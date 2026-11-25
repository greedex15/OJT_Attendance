import React from "react";
import { FileSpreadsheet, Printer } from "lucide-react";

function csvEscape(val) {
  const str = String(val ?? "");
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatIsoTime(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const local = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
  const philippines = d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Manila",
  });
  return `${local} (local) / ${philippines} PHT`;
}

function formatHours(minutes) {
  if (minutes === null || minutes === undefined) return "";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${String(mins).padStart(2, "0")}m`;
}

function getDurationMinutes(record) {
  const start = new Date(record.time_in).getTime();
  const end = record.time_out ? new Date(record.time_out).getTime() : Date.now();
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.floor((end - start) / 60000))
    : null;
}

export default function ExportButtons({ records, onNotify }) {
  function handleExportCsv() {
    if (!records || records.length === 0) {
      onNotify?.("No attendance records to export.", "warning");
      return;
    }

    const headers = [
      "Student ID",
      "Student Name",
      "Course",
      "Department",
      "Date",
      "Time In (local / PHT)",
      "Time Out (local / PHT)",
      "Duration (Minutes)",
      "Duration (Formatted)",
      "Status",
      "Clock-In Supervisor",
      "Clock-Out Supervisor",
      "Notes",
    ];

    const rows = records.map((rec) => {
      const duration = getDurationMinutes(rec);
      return [
        rec.student_id,
        rec.student_name,
        rec.course || "",
        rec.department || "",
        rec.date,
        formatIsoTime(rec.time_in),
        formatIsoTime(rec.time_out),
        duration ?? "",
        formatHours(duration),
        rec.status,
        rec.clock_in_supervisor,
        rec.clock_out_supervisor || "",
        rec.notes || "",
      ]
        .map(csvEscape)
        .join(",");
    });

    const csvContent = "\uFEFF" + [headers.map(csvEscape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `ojt-attendance-dtr-${today}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    onNotify?.(`Exported ${records.length} OJT attendance record(s) to CSV.`, "success");
  }

  function handlePrintDtr() {
    if (!records || records.length === 0) {
      onNotify?.("No attendance records to print.", "warning");
      return;
    }
    window.print();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <button
        type="button"
        onClick={handleExportCsv}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition"
      >
        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
        Export CSV
      </button>

      <button
        type="button"
        onClick={handlePrintDtr}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition"
      >
        <Printer className="w-4 h-4 text-blue-600" />
        Print / PDF DTR
      </button>
    </div>
  );
}
