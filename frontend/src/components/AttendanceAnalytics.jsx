import React, { useEffect, useMemo, useState } from "react";

const REASONS = [
  "Traffic",
  "Weather",
  "Health/Appointment",
  "Emergency",
  "Schedule Conflict",
  "Other",
];

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#ea580c", "#db2777", "#0891b2", "#4f46e5"];

function getGroup(student) {
  return student.major?.trim() || student.section?.trim() || student.course?.trim() || "Unassigned";
}

function describeSlice(start, end) {
  const radius = 90;
  const point = (angle) => {
    const radians = (angle - 90) * Math.PI / 180;
    return [100 + radius * Math.cos(radians), 100 + radius * Math.sin(radians)];
  };
  if (end - start >= 359.999) return "M 100 10 A 90 90 0 1 1 99.99 10 Z";
  const [x1, y1] = point(start);
  const [x2, y2] = point(end);
  return `M 100 100 L ${x1} ${y1} A 90 90 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

export default function AttendanceAnalytics({ students, records }) {
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");

  const groups = useMemo(() => {
    const byName = new Map();
    students.forEach((student) => {
      const group = getGroup(student);
      if (!byName.has(group)) byName.set(group, []);
      byName.get(group).push(student);
    });
    return [...byName.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [students]);

  useEffect(() => {
    if (!groups.some(([group]) => group === selectedGroup)) {
      setSelectedGroup(groups[0]?.[0] || "");
      setSelectedStudentId("");
    }
  }, [groups, selectedGroup]);

  const selectedStudents = groups.find(([group]) => group === selectedGroup)?.[1] || [];
  useEffect(() => {
    if (!selectedStudents.some((student) => student.student_id === selectedStudentId)) {
      setSelectedStudentId(selectedStudents[0]?.student_id || "");
    }
  }, [selectedStudents, selectedStudentId]);

  const slices = useMemo(() => {
    const data = groups.flatMap(([group, members], groupIndex) => {
      const count = (gender) => members.filter((student) => (student.gender || "Unspecified") === gender).length;
      return ["Male", "Female", "Unspecified"].map((gender) => ({
        group,
        gender,
        value: count(gender),
        color: gender === "Unspecified"
          ? "#94a3b8"
          : `hsl(${groupIndex * 53 % 360} 70% ${gender === "Male" ? "45%" : "68%"})`,
      })).filter((slice) => slice.value);
    });
    const total = data.reduce((sum, slice) => sum + slice.value, 0);
    let angle = 0;
    return data.map((slice) => {
      const start = angle;
      angle += total ? slice.value / total * 360 : 0;
      return { ...slice, start, end: angle };
    });
  }, [groups]);

  const lateCounts = useMemo(() => {
    const target = selectedStudentId.toLowerCase();
    const ownRecords = records.filter((record) => record.student_id.toLowerCase() === target);
    return REASONS.map((reason) => ({
      reason,
      count: ownRecords.filter((record) => record.late_reason === reason).length,
    }));
  }, [records, selectedStudentId]);
  const maxLateCount = Math.max(...lateCounts.map(({ count }) => count), 1);
  const selectedStudent = students.find((student) => student.student_id === selectedStudentId);

  return (
    <section className="space-y-4" aria-label="Attendance analytics">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="font-semibold text-slate-900">Trainees by Major</h3>
            <p className="text-xs text-slate-500">Male and female trainee distribution</p>
          </div>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <svg viewBox="0 0 200 200" role="img" aria-label="Pie chart of trainee gender by major" className="h-52 w-52 shrink-0">
              <circle cx="100" cy="100" r="90" fill="#e2e8f0" />
              {slices.map((slice) => (
                <path
                  key={`${slice.group}-${slice.gender}`}
                  d={describeSlice(slice.start, slice.end)}
                  fill={slice.color}
                  stroke="white"
                  strokeWidth="1.5"
                  className="cursor-pointer"
                  onClick={() => { setSelectedGroup(slice.group); setSelectedStudentId(""); }}
                >
                  <title>{`${slice.group} · ${slice.gender}: ${slice.value}`}</title>
                </path>
              ))}
            </svg>
            <div className="max-h-52 flex-1 space-y-1 overflow-y-auto text-xs">
              {slices.map((slice) => (
                <button
                  key={`${slice.group}-${slice.gender}-legend`}
                  type="button"
                  onClick={() => { setSelectedGroup(slice.group); setSelectedStudentId(""); }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-50 ${selectedGroup === slice.group ? "bg-blue-50" : ""}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }} />
                  <span className="min-w-0 flex-1 truncate">{slice.group} · {slice.gender}</span>
                  <span className="font-semibold tabular-nums">{slice.value}</span>
                </button>
              ))}
              {slices.length === 0 && <p className="p-2 text-slate-500">No trainee profiles found.</p>}
            </div>
          </div>
          {groups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {groups.map(([group, members], index) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => { setSelectedGroup(group); setSelectedStudentId(""); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedGroup === group ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  {group} ({members.length})
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h3 className="font-semibold text-slate-900">Late Clock-in Reasons</h3>
            <p className="text-xs text-slate-500">Select a trainee to view recorded reasons</p>
          </div>
          <label htmlFor="analytics-trainee" className="mt-3 block text-xs font-medium text-slate-600">Trainee</label>
          <select
            id="analytics-trainee"
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            disabled={!selectedStudents.length}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {selectedStudents.map((student) => (
              <option key={student.student_id} value={student.student_id}>
                {student.full_name} · {student.student_id}
              </option>
            ))}
          </select>
          {selectedStudent && (
            <p className="mt-2 text-xs text-slate-500">
              {getGroup(selectedStudent)} · {selectedStudent.gender || "Gender not recorded"}
            </p>
          )}
          <div className="mt-4 space-y-3" aria-label="Late reason counts">
            {lateCounts.map(({ reason, count }) => (
              <div key={reason} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-2 text-xs">
                <span className="truncate text-slate-600">{reason}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${count / maxLateCount * 100}%` }} />
                </div>
                <span className="text-right font-semibold tabular-nums text-slate-700">{count}</span>
              </div>
            ))}
          </div>
          {selectedStudent && lateCounts.every(({ count }) => count === 0) && (
            <p className="mt-3 text-xs text-slate-400">No late reasons have been recorded for this trainee.</p>
          )}
        </section>
      </div>
    </section>
  );
}
