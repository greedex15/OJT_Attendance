import React, { useState } from "react";
import { Clock, Eye, EyeOff, IdCard, Lock, LogIn } from "lucide-react";

export default function LoginPage({ onLoginSuccess, apiRequest }) {
  const [schoolId, setSchoolId] = useState("");
  const [lrn, setLrn] = useState("");
  const [showLrn, setShowLrn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const data = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: schoolId.trim(),
          password: lrn.trim(),
        }),
      });
      onLoginSuccess(data);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDefaultUser() {
    setSchoolId("23-0679");
    setLrn("103013100015");
    setError("");
  }

  function fillDefaultAdmin() {
    setSchoolId("12-3456");
    setLrn("123456789012");
    setError("");
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md mb-3">
            <Clock className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            OJT Attendance System
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in with your assigned School ID and LRN
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <LogIn className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-800">Account Sign In</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="auth-school-id"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
              >
                School ID *
              </label>
              <div className="relative">
                <IdCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-school-id"
                  type="text"
                  required
                  autoComplete="username"
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  placeholder="e.g. 23-0679"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-lrn"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-1.5"
              >
                LRN / Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-lrn"
                  type={showLrn ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={lrn}
                  onChange={(e) => setLrn(e.target.value)}
                  placeholder="Enter your LRN or admin password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowLrn((prev) => !prev)}
                  aria-label={showLrn ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  {showLrn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {submitting ? "Signing in..." : "Sign In"}
            </button>

            <div className="pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-500">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-700">User:</span>{" "}
                  <code className="font-mono text-slate-700">23-0679</code> /{" "}
                  <code className="font-mono text-slate-700">103013100015</code>
                </div>
                <button
                  type="button"
                  onClick={fillDefaultUser}
                  className="text-blue-600 hover:text-blue-700 font-semibold shrink-0"
                >
                  Auto-fill User
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-700">Admin:</span>{" "}
                  <code className="font-mono text-slate-700">12-3456</code> /{" "}
                  <code className="font-mono text-slate-700">123456789012</code>
                </div>
                <button
                  type="button"
                  onClick={fillDefaultAdmin}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold shrink-0"
                >
                  Auto-fill Admin
                </button>
              </div>
              <p className="text-[11px] text-slate-400 pt-1">
                New accounts can only be added by an Administrator.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
