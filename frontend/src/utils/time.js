export function parseAttendanceTimestamp(value) {
  if (!value) return null;
  const iso = typeof value === "string" && value.includes("T") &&
    !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value}Z`
    : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}
