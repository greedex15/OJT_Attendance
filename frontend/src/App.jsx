import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  LogOut,
  MessageSquare,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import QRScanner from "./components/QRScanner.jsx";
import QRBadgeModal from "./components/QRBadgeModal.jsx";
import SignatureModal from "./components/SignatureModal.jsx";
import ExportButtons from "./components/ExportButtons.jsx";
import LoginPage from "./components/LoginPage.jsx";
import JournalPage from "./components/JournalEditor.jsx";
import ChatboxPage from "./components/ChatboxPage.jsx";
import { parseAttendanceTimestamp } from "./utils/time.js";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const AUTH_TOKEN_KEY = "ojt_auth_token";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        message = Array.isArray(errBody.detail)
          ? errBody.detail.map((d) => d.msg).join(", ")
          : String(errBody.detail);
      }
    } catch { /* Keep status message */ }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

function formatDtrTime(isoStr) {
  if (!isoStr) return "—";
  const d = parseAttendanceTimestamp(isoStr);
  if (!d) return isoStr;
  const local = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const philippines = d.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
  return `${local} (local) · ${philippines} PHT`;
}

function formatDurationMinutes(timeInIso, timeOutIso) {
  const start = parseAttendanceTimestamp(timeInIso)?.getTime();
  const end = timeOutIso ? parseAttendanceTimestamp(timeOutIso)?.getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const mins = Math.max(0, Math.floor((end - start) / 60000));
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  const formatted = `${hrs}h ${String(rem).padStart(2, "0")}m`;
  return timeOutIso ? formatted : `${formatted} (live)`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const colors = {
    success: "bg-emerald-600",
    error: "bg-rose-600",
    warning: "bg-amber-500",
    info: "bg-slate-700",
  };
  return (
    <div
      className={`fixed bottom-24 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-white text-sm font-medium shadow-xl max-w-sm w-[90vw] text-center transition-all ${colors[toast.type] || colors.info}`}
    >
      {toast.message}
    </div>
  );
}

// ─── Attendance Card (mobile-friendly) ───────────────────────────────────────
function AttendanceCard({ rec }) {
  const isActive = !rec.time_out;
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm space-y-2 ${isActive ? "border-emerald-200" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-slate-900 text-sm">{rec.student_name}</div>
          <div className="font-mono text-xs text-slate-500 mt-0.5">{rec.student_id}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
          {rec.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-slate-400 font-semibold uppercase text-[10px]">Date</div>
          <div className="font-mono text-slate-700">{rec.date}</div>
        </div>
        <div>
          <div className="text-slate-400 font-semibold uppercase text-[10px]">Time In</div>
          <div className="font-mono text-emerald-700">{formatDtrTime(rec.time_in)}</div>
        </div>
        <div>
          <div className="text-slate-400 font-semibold uppercase text-[10px]">Time Out</div>
          <div className="font-mono text-amber-700">{rec.time_out ? formatDtrTime(rec.time_out) : "—"}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <div>
          <div className="text-slate-400 font-semibold uppercase text-[10px]">Duration</div>
          <div className="font-mono text-slate-700">{formatDurationMinutes(rec.time_in, rec.time_out)}</div>
        </div>
        <div className="text-right">
          <div className="text-slate-400 font-semibold uppercase text-[10px]">Supervisor</div>
          <div className="text-slate-700 truncate max-w-[140px]">{rec.clock_in_supervisor}</div>
        </div>
      </div>

      {rec.notes && (
        <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-slate-500 uppercase text-[10px] mr-1">Notes:</span>
          {rec.notes}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [records, setRecords] = useState([]);
  const [students, setStudents] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [submittingSignature, setSubmittingSignature] = useState(false);
  const [nowClock, setNowClock] = useState(new Date());

  // Tab navigation: "attendance" | "journal"
  const [activeTab, setActiveTab] = useState("attendance");

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Modals
  const [sigModalState, setSigModalState] = useState({ isOpen: false, mode: "clock-in", studentData: null });
  const [sigPreview, setSigPreview] = useState(null);
  const [qrBadgeStudent, setQrBadgeStudent] = useState(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    username: "", full_name: "", password: "", role: "user",
    course: "", school: "", department: "", required_hours: 486,
  });
  const [adminAccountSearch, setAdminAccountSearch] = useState("");
  const [traineeDirectorySearch, setTraineeDirectorySearch] = useState("");
  const [editingTrainee, setEditingTrainee] = useState(null);
  const [traineeProfileForm, setTraineeProfileForm] = useState(null);
  const [savingTraineeProfile, setSavingTraineeProfile] = useState(false);
  const [toast, setToast] = useState(null);

  const isAdmin = currentUser?.role === "admin";

  const notify = useCallback((message, type = "info") => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setCurrentUser(null);
    setRecords([]);
    setStudents([]);
    setUsersList([]);
    setActiveTab("attendance");
  }, []);

  // Verify stored JWT session on mount
  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setAuthChecking(false); return; }
    apiRequest("/api/auth/me")
      .then((user) => { if (mounted) setCurrentUser(user); })
      .catch(() => { localStorage.removeItem(AUTH_TOKEN_KEY); if (mounted) setCurrentUser(null); })
      .finally(() => { if (mounted) setAuthChecking(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDirectory = useCallback(async () => {
    if (!currentUser) return;
    try {
      const studentData = await apiRequest("/api/students");
      setStudents(studentData);
      if (currentUser.role === "admin") {
        const userData = await apiRequest("/api/users");
        setUsersList(userData);
      }
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(`Failed to load directory: ${err.message}`, "error");
    }
  }, [currentUser, handleLogout, notify]);

  const fetchRecords = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString();
      const data = await apiRequest(`/api/records${qs ? `?${qs}` : ""}`);
      setRecords(data);
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(`Failed to load attendance records: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [currentUser, search, statusFilter, dateFrom, dateTo, handleLogout, notify]);

  useEffect(() => { if (currentUser) { fetchDirectory(); } }, [currentUser, fetchDirectory]);
  useEffect(() => { if (currentUser) { fetchRecords(); } }, [currentUser, fetchRecords]);

  function handleLoginSuccess(authResponse) {
    localStorage.setItem(AUTH_TOKEN_KEY, authResponse.access_token);
    setCurrentUser(authResponse.user);
    notify(`Welcome, ${authResponse.user.full_name}!`, "success");
  }

  async function handleLookupStudent(code) {
    if (isAdmin) {
      notify("Admin accounts are for monitoring only.", "warning");
      return;
    }
    setLookupBusy(true);
    try {
      const info = await apiRequest(`/api/students/lookup?code=${encodeURIComponent(code)}`);
      const mode = info.active_record ? "clock-out" : "clock-in";
      setSigModalState({ isOpen: true, mode, studentData: info });
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(`QR Lookup failed: ${err.message}`, "error");
    } finally {
      setLookupBusy(false);
    }
  }

  async function handleSignatureSubmit(payload) {
    setSubmittingSignature(true);
    // Always include current client ISO time for accurate timestamp
    const clientTime = new Date().toISOString();
    try {
      if (sigModalState.mode === "clock-out") {
        await apiRequest("/api/clock-out", {
          method: "POST",
          body: JSON.stringify({
            student_id: payload.student_id,
            record_id: payload.record_id,
            supervisor_name: payload.supervisor_name,
            signature_base64: payload.signature_base64,
            notes: payload.notes,
            client_time: clientTime,
          }),
        });
        notify(`Clocked out! Verified by ${payload.supervisor_name}.`, "success");
      } else {
        await apiRequest("/api/clock-in", {
          method: "POST",
          body: JSON.stringify({
            student_id: payload.student_id,
            student_name: payload.student_name,
            course: payload.course,
            department: payload.department,
            supervisor_name: payload.supervisor_name,
            signature_base64: payload.signature_base64,
            notes: payload.notes,
            client_time: clientTime,
          }),
        });
        notify(`Clocked in! Verified by ${payload.supervisor_name}.`, "success");
      }
      setSigModalState({ isOpen: false, mode: "clock-in", studentData: null });
      await fetchRecords();
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(err.message, "error");
    } finally {
      setSubmittingSignature(false);
    }
  }

  async function handleAdminCreateUser(e) {
    e.preventDefault();
    try {
      await apiRequest("/api/users", {
        method: "POST",
        body: JSON.stringify({ ...newUserForm, required_hours: Number(newUserForm.required_hours) || 486 }),
      });
      notify(`Added ${newUserForm.role} account for ${newUserForm.full_name}.`, "success");
      setNewUserForm({ username: "", full_name: "", password: "", role: "user", course: "", school: "", department: "", required_hours: 486 });
      setShowAddUserModal(false);
      await fetchDirectory();
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(`Could not add user: ${err.message}`, "error");
    }
  }

  function openTraineeProfile(user) {
    const profile = students.find(
      (student) => student.student_id.toLowerCase() === user.username.toLowerCase(),
    );
    setEditingTrainee(user);
    setTraineeProfileForm({
      full_name: profile?.full_name || user.full_name,
      course: profile?.course || "",
      school: profile?.school || "",
      department: profile?.department || "",
      required_hours: profile?.required_hours || 486,
    });
  }

  async function handleAdminUpdateTraineeProfile(event) {
    event.preventDefault();
    if (!editingTrainee || !traineeProfileForm) return;

    setSavingTraineeProfile(true);
    try {
      await apiRequest(`/api/users/${editingTrainee.id}/profile`, {
        method: "PUT",
        body: JSON.stringify({
          ...traineeProfileForm,
          required_hours: Number(traineeProfileForm.required_hours),
        }),
      });
      notify(`Updated profile for ${traineeProfileForm.full_name}.`, "success");
      setEditingTrainee(null);
      setTraineeProfileForm(null);
      await fetchDirectory();
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      notify(`Could not update trainee profile: ${err.message}`, "error");
    } finally {
      setSavingTraineeProfile(false);
    }
  }

  const accountKeyword = adminAccountSearch.trim().toLowerCase();
  const filteredAdminAccounts = usersList.filter(
    (account) => account.role === "admin"
      && (!accountKeyword || `${account.full_name} ${account.username}`.toLowerCase().includes(accountKeyword)),
  );
  const traineeKeyword = traineeDirectorySearch.trim().toLowerCase();
  const filteredTrainees = usersList
    .filter((account) => account.role === "user")
    .map((account) => ({
      account,
      profile: students.find(
        (student) => student.student_id.toLowerCase() === account.username.toLowerCase(),
      ),
    }))
    .filter(({ account, profile }) => !traineeKeyword || [
      account.full_name,
      account.username,
      profile?.course,
      profile?.school,
      profile?.department,
    ].some((value) => value?.toLowerCase().includes(traineeKeyword)));

  const stats = useMemo(() => {
    const active = records.filter((r) => !r.time_out).length;
    const completed = records.filter((r) => Boolean(r.time_out));
    const totalMinutes = completed.reduce((sum, r) => sum + (Number(r.duration_minutes) || 0), 0);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return { total: records.length, active, completedCount: completed.length, totalHoursFormatted: `${hrs}h ${String(mins).padStart(2, "0")}m` };
  }, [records]);

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-600">
        Verifying session…
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} apiRequest={apiRequest} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">

      {/* ── Top Header ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-slate-200 shadow-sm shrink-0 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0 ${isAdmin ? "bg-indigo-600" : "bg-blue-600"}`}>
              {isAdmin ? <Eye className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-slate-900 leading-tight">OJT Attendance</h1>
              <p className="text-[11px] text-slate-500 leading-tight truncate max-w-[180px] sm:max-w-xs">
                {currentUser.full_name}
                <span className={`ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isAdmin ? "bg-indigo-600 text-white" : "bg-blue-200 text-blue-900"}`}>
                  {currentUser.role}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live clock (desktop) */}
            <div className="hidden sm:block text-right">
              <div className="font-mono text-sm font-bold text-slate-900">{nowClock.toLocaleTimeString()}</div>
              <div className="text-[11px] text-slate-500">
                {nowClock.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </div>
            </div>

            {!isAdmin && (
              <button
                type="button"
                onClick={() => {
                  const matched = students.find((s) => s.student_id.toLowerCase() === currentUser.username.toLowerCase());
                  setQrBadgeStudent(matched || { student_id: currentUser.username, full_name: currentUser.full_name, qr_code_value: currentUser.username });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">My QR</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Add User</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-700 text-xs font-semibold transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-4xl mx-auto px-4 flex border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveTab("attendance")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === "attendance" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <Clock className="w-4 h-4" />
            Attendance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("journal")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === "journal" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <BookOpen className="w-4 h-4" />
            Journal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("chatbox")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${activeTab === "chatbox" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            <MessageSquare className="w-4 h-4" />
            Chatbox
          </button>
        </div>
      </header>

      {/* ── Journal Page ───────────────────────────────────────────────────── */}
      {activeTab === "journal" && (
        <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col min-h-0">
          <JournalPage
            currentUser={currentUser}
            apiRequest={apiRequest}
            onNotify={notify}
            onBack={() => setActiveTab("attendance")}
          />
        </div>
      )}

      {activeTab === "chatbox" && (
        <ChatboxPage
          currentUser={currentUser}
          apiRequest={apiRequest}
          onNotify={notify}
        />
      )}

      {/* ── Attendance Page ────────────────────────────────────────────────── */}
      {activeTab === "attendance" && (
        <main className="max-w-4xl mx-auto w-full px-4 py-5 space-y-5 no-print">

          {/* KPI Cards */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: isAdmin ? "Total Logs" : "My Total Logs", value: stats.total, sub: "Filtered records", color: "text-slate-900" },
              { label: "Clocked In Now", value: stats.active, sub: isAdmin ? "Active trainees" : "Active shift", color: "text-emerald-600" },
              { label: "Completed Shifts", value: stats.completedCount, sub: "Signed off", color: "text-slate-900" },
              { label: "OJT Hours", value: stats.totalHoursFormatted, sub: "Verified hours", color: "text-blue-600" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</div>
                <div className={`text-xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{kpi.sub}</div>
              </div>
            ))}
          </section>

          {/* QR Scanner (users only) */}
          {!isAdmin && (
            <QRScanner
              onLookupStudent={handleLookupStudent}
              onShowQrBadge={setQrBadgeStudent}
              students={students}
              isBusy={lookupBusy}
            />
          )}

          {/* Admin Accounts */}
          {isAdmin && (
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-indigo-50/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Admin Accounts ({usersList.filter((u) => u.role === "admin").length})</h2>
                    <p className="text-[11px] text-slate-500">Search administrator accounts</p>
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-3">
                <input
                  type="search"
                  value={adminAccountSearch}
                  onChange={(event) => setAdminAccountSearch(event.target.value)}
                  placeholder="Filter admins by name or School ID…"
                  aria-label="Filter admin accounts"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex flex-wrap gap-2">
                  {filteredAdminAccounts.map((account) => (
                    <div key={account.id} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">{account.full_name}</div>
                        <div className="font-mono text-[11px] text-slate-500">ID: {account.username}</div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-800">
                        Admin
                      </span>
                    </div>
                  ))}
                  {filteredAdminAccounts.length === 0 && (
                    <p className="text-xs text-slate-400 p-2">
                      {usersList.some((account) => account.role === "admin") ? "No admin accounts match your filter." : "No admin accounts found."}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Trainee Directory */}
          {isAdmin && (
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-indigo-50/40 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Trainee Directory ({usersList.filter((u) => u.role === "user").length})</h2>
                    <p className="text-[11px] text-slate-500">Search and update trainee profiles</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              <div className="p-3 space-y-3">
                <input
                  type="search"
                  value={traineeDirectorySearch}
                  onChange={(event) => setTraineeDirectorySearch(event.target.value)}
                  placeholder="Filter trainees by name, ID, course, school, or department…"
                  aria-label="Filter trainee directory"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex flex-wrap gap-2">
                  {filteredTrainees.map(({ account, profile }) => (
                    <div key={account.id} className="flex items-center justify-between gap-3 w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span className="truncate">{account.full_name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">Trainee</span>
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">ID: {account.username}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[profile?.course, profile?.school, profile?.department].filter(Boolean).join(" · ") || "Profile details not available"}
                        </div>
                        {profile && <div className="text-[11px] text-slate-500">Required: {profile.required_hours} hours</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openTraineeProfile(account)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-indigo-50 text-slate-700 font-medium transition"
                        >
                          Edit Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrBadgeStudent(profile || { student_id: account.username, full_name: account.full_name, qr_code_value: account.username })}
                          aria-label={`Show QR code for ${account.full_name}`}
                          className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-blue-50 text-slate-500 hover:text-blue-600 transition"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredTrainees.length === 0 && (
                    <p className="text-xs text-slate-400 p-2">
                      {usersList.some((account) => account.role === "user") ? "No trainees match your filter." : "No trainee accounts found."}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Attendance Records */}
          <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  {isAdmin ? "All Attendance Logs" : "My Attendance Logs"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <ExportButtons records={records} onNotify={notify} />
                <button
                  type="button"
                  onClick={fetchRecords}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isAdmin ? "Search by name, ID, supervisor…" : "Search supervisor…"}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white flex-1 min-w-[120px]"
                >
                  <option value="all">All Statuses</option>
                  <option value="in">Clocked In</option>
                  <option value="out">Clocked Out</option>
                </select>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white flex-1 min-w-[130px]" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white flex-1 min-w-[130px]" />
                {(search || statusFilter !== "all" || dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg bg-white"
                  >
                    <X className="w-3.5 h-3.5" /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Records list */}
            <div className="p-4">
              {loading ? (
                <div className="text-center py-10 text-sm text-slate-400">Loading records…</div>
              ) : records.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No attendance records found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {isAdmin ? "Logs appear once trainees clock in." : "Use the QR scanner above to record your attendance."}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {records.map((rec) => <AttendanceCard key={rec.id} rec={rec} />)}
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* ── Printable DTR (hidden on screen) ──────────────────────────────── */}
      <div className="hidden print-only p-6 text-black">
        <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold uppercase tracking-wide">OJT Daily Time Record</h1>
            <p className="text-xs text-slate-700 mt-0.5">Official Attendance & Supervisor Verification Report</p>
          </div>
          <div className="text-right text-xs">
            <div>Generated: <strong>{new Date().toLocaleString()}</strong></div>
            <div>Total Entries: <strong>{records.length}</strong> · Hours: <strong>{stats.totalHoursFormatted}</strong></div>
          </div>
        </div>
        <table className="dtr-table w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100">
              {["Student ID", "Name", "Date", "Time In", "Time Out", "Duration", "Supervisor In", "Supervisor Out"].map((h) => (
                <th key={h} className="border border-slate-400 px-2 py-1.5 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.id} className="dtr-row">
                <td className="border border-slate-400 px-2 py-1.5 font-mono">{rec.student_id}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-semibold">{rec.student_name}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono">{rec.date}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono">{formatDtrTime(rec.time_in)}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono">{rec.time_out ? formatDtrTime(rec.time_out) : "In Progress"}</td>
                <td className="border border-slate-400 px-2 py-1.5 font-mono">{formatDurationMinutes(rec.time_in, rec.time_out)}</td>
                <td className="border border-slate-400 px-2 py-1.5">
                  <div className="dtr-signoff flex items-center gap-1">
                    <span>{rec.clock_in_supervisor}</span>
                    {rec.clock_in_signature && <img src={rec.clock_in_signature} alt="" className="dtr-signature-img h-7 w-16 object-contain" />}
                  </div>
                </td>
                <td className="border border-slate-400 px-2 py-1.5">
                  {rec.clock_out_supervisor ? (
                    <div className="dtr-signoff flex items-center gap-1">
                      <span>{rec.clock_out_supervisor}</span>
                      {rec.clock_out_signature && <img src={rec.clock_out_signature} alt="" className="dtr-signature-img h-7 w-16 object-contain" />}
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Bottom Nav (mobile) ────────────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-20 shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 transition ${activeTab === "attendance" ? "text-blue-600" : "text-slate-400"}`}
        >
          <Clock className="w-5 h-5" />
          Attendance
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("journal")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 transition ${activeTab === "journal" ? "text-blue-600" : "text-slate-400"}`}
        >
          <BookOpen className="w-5 h-5" />
          Journal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("chatbox")}
          className={`flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 transition ${activeTab === "chatbox" ? "text-blue-600" : "text-slate-400"}`}
        >
          <MessageSquare className="w-5 h-5" />
          Chatbox
        </button>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => {
              const matched = students.find((s) => s.student_id.toLowerCase() === currentUser.username.toLowerCase());
              setQrBadgeStudent(matched || { student_id: currentUser.username, full_name: currentUser.full_name, qr_code_value: currentUser.username });
            }}
            className="flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 text-slate-400"
          >
            <QrCode className="w-5 h-5" />
            My QR
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAddUserModal(true)}
            className="flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 text-slate-400"
          >
            <UserPlus className="w-5 h-5" />
            Add User
          </button>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="flex-1 flex flex-col items-center py-2.5 text-[11px] font-semibold gap-1 text-slate-400"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </nav>

      {/* Spacer for bottom nav on mobile */}
      <div className="sm:hidden h-16 shrink-0" />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {sigModalState.isOpen && !isAdmin && (
        <SignatureModal
          isOpen={sigModalState.isOpen}
          mode={sigModalState.mode}
          studentData={sigModalState.studentData}
          onSubmit={handleSignatureSubmit}
          onClose={() => setSigModalState({ isOpen: false, mode: "clock-in", studentData: null })}
          isSubmitting={submittingSignature}
        />
      )}

      {qrBadgeStudent && (
        <QRBadgeModal
          student={qrBadgeStudent}
          onClose={() => setQrBadgeStudent(null)}
          allowClockAction={!isAdmin}
          onClockAction={handleLookupStudent}
        />
      )}

      {/* Add User Modal */}
      {showAddUserModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold text-slate-900">Add User / Trainee</span>
              </div>
              <button type="button" onClick={() => setShowAddUserModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdminCreateUser} className="p-4 space-y-3">
              {[
                { label: "School ID *", key: "username", type: "text", placeholder: "e.g. 23-0123" },
                { label: "Full Name *", key: "full_name", type: "text", placeholder: "e.g. Juan Dela Cruz" },
                { label: "Password (LRN) *", key: "password", type: "text", placeholder: "Student LRN" },
                { label: "Course", key: "course", type: "text", placeholder: "e.g. BS Information Technology" },
                { label: "School", key: "school", type: "text", placeholder: "e.g. Polytechnic University" },
                { label: "Department", key: "department", type: "text", placeholder: "e.g. Software Engineering" },
                { label: "Required Hours", key: "required_hours", type: "number", placeholder: "486" },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block">{label}</label>
                  <input
                    type={type}
                    value={newUserForm[key]}
                    onChange={(e) => setNewUserForm({ ...newUserForm, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Role</label>
                <select
                  value={newUserForm.role}
                  onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="user">User (Trainee)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition"
                >
                  Add Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTrainee && traineeProfileForm && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
              <div>
                <h2 className="font-semibold text-slate-900">Edit Trainee Profile</h2>
                <p className="text-xs text-slate-500">School ID: {editingTrainee.username} (unchanged)</p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingTrainee(null); setTraineeProfileForm(null); }}
                disabled={savingTraineeProfile}
                aria-label="Close profile editor"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdminUpdateTraineeProfile} className="p-4 space-y-3">
              {[
                { label: "Full Name *", key: "full_name", type: "text", required: true },
                { label: "Course", key: "course", type: "text" },
                { label: "School", key: "school", type: "text" },
                { label: "Department", key: "department", type: "text" },
                { label: "Required Hours *", key: "required_hours", type: "number", min: 1, max: 5000, required: true },
              ].map(({ label, key, type, ...attributes }) => (
                <div key={key}>
                  <label htmlFor={`trainee-profile-${key}`} className="text-xs font-semibold text-slate-600 mb-1 block">{label}</label>
                  <input
                    id={`trainee-profile-${key}`}
                    type={type}
                    value={traineeProfileForm[key]}
                    onChange={(event) => setTraineeProfileForm({ ...traineeProfileForm, [key]: event.target.value })}
                    {...attributes}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setEditingTrainee(null); setTraineeProfileForm(null); }}
                  disabled={savingTraineeProfile}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-medium text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTraineeProfile}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition disabled:opacity-50"
                >
                  {savingTraineeProfile ? "Saving…" : "Save Profile"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signature Preview Modal */}
      {sigPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setSigPreview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-xs w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="font-semibold text-slate-900 mb-1">{sigPreview.title}</div>
            <div className="text-xs text-slate-500 mb-3">{sigPreview.supervisor} · {sigPreview.timestamp}</div>
            <img src={sigPreview.signature} alt="Supervisor signature" className="border border-slate-200 rounded-lg mx-auto max-w-full" />
            <button type="button" onClick={() => setSigPreview(null)} className="mt-4 px-6 py-2 rounded-xl bg-slate-800 text-white text-sm font-medium">Close</button>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
