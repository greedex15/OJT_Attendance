import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";

const ROLES = ["Coordinator", "Supervisor", "Adviser"];

const ROLE_STYLES = {
  Coordinator: "bg-indigo-100 text-indigo-700",
  Supervisor: "bg-emerald-100 text-emerald-700",
  Adviser: "bg-amber-100 text-amber-800",
};

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ChatboxPage({ currentUser, apiRequest, onNotify }) {
  const [messages, setMessages] = useState([]);
  const [role, setRole] = useState("Coordinator");
  const [filter, setFilter] = useState("All");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiRequest("/api/messages");
      setMessages((existing) => {
        const byId = new Map(existing.map((message) => [message.id, message]));
        data.forEach((message) => byId.set(message.id, message));
        return [...byId.values()].sort(
          (left, right) => new Date(left.created_at) - new Date(right.created_at) || left.id - right.id,
        );
      });
      setLoadError("");
    } catch (error) {
      setLoadError(`Could not load messages: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    loadMessages();
    const timer = setInterval(loadMessages, 10000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  const visibleMessages = useMemo(
    () => filter === "All" ? messages : messages.filter((message) => message.sender_role === filter),
    [filter, messages],
  );

  async function sendMessage(event) {
    event.preventDefault();
    if (!content.trim() || sending) return;

    setSending(true);
    try {
      const message = await apiRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ sender_role: role, content }),
      });
      setMessages((existing) => [...existing, message]);
      setContent("");
    } catch (error) {
      onNotify(`Message could not be sent: ${error.message}`, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-5 flex flex-col min-h-0">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-h-[65vh] overflow-hidden">
        <header className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="font-semibold text-slate-900">OJT Chatbox</h2>
              <p className="text-xs text-slate-500">Coordinate with coordinators, supervisors, and advisers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="chat-role-filter" className="text-xs font-medium text-slate-600">View</label>
            <select
              id="chat-role-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="px-2.5 py-2 border border-slate-300 rounded-lg bg-white text-sm"
            >
              <option value="All">All roles</option>
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button
              type="button"
              onClick={loadMessages}
              aria-label="Refresh messages"
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
          {loadError && <p role="status" className="text-sm text-rose-600">{loadError}</p>}
          {loading && messages.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-10">Loading messages…</p>
          ) : visibleMessages.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-10">
              <MessageSquare className="w-9 h-9 mx-auto mb-2 text-slate-200" />
              No messages for this view yet.
            </div>
          ) : visibleMessages.map((message) => (
            <article key={message.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm text-slate-900 truncate">{message.sender_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_STYLES[message.sender_role]}`}>
                    {message.sender_role}
                  </span>
                </div>
                <time dateTime={message.created_at} className="text-[11px] text-slate-500">
                  {formatTimestamp(message.created_at)}
                </time>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{message.content}</p>
            </article>
          ))}
        </div>

        <form onSubmit={sendMessage} className="border-t border-slate-200 p-3 sm:p-4 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="chat-sender-role">Send as</label>
            <select
              id="chat-sender-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="sm:w-44 px-3 py-2.5 border border-slate-300 rounded-lg bg-white text-sm"
            >
              {ROLES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className="sr-only" htmlFor="chat-message">Message</label>
            <textarea
              id="chat-message"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form.requestSubmit();
                }
              }}
              maxLength={4000}
              rows={2}
              placeholder={`Message as ${currentUser.full_name}… (Enter to send, Shift+Enter for a new line)`}
              className="flex-1 resize-y min-h-11 px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={sending || !content.trim()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Sending as <span className="font-semibold text-slate-700">{currentUser.full_name}</span> · Messages refresh automatically.
          </p>
        </form>
      </section>
    </main>
  );
}
