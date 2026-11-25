import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageSquare, RefreshCw, Search, Send } from "lucide-react";

const ROLES = ["admin", "coordinator", "supervisor", "adviser"];

const ROLE_STYLES = {
  admin: "bg-indigo-100 text-indigo-700",
  coordinator: "bg-violet-100 text-violet-700",
  supervisor: "bg-emerald-100 text-emerald-700",
  adviser: "bg-amber-100 text-amber-800",
};

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatRole(role) {
  return role === "adviser" ? "OJT Adviser" : `${role[0].toUpperCase()}${role.slice(1)}`;
}

function Avatar({ person, className = "h-10 w-10" }) {
  return person.profile_image ? (
    <img src={person.profile_image} alt="" className={`${className} rounded-full object-cover`} />
  ) : (
    <span className={`${className} inline-flex items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700`}>
      {(person.full_name || person.sender_name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function ChatboxPage({ currentUser, apiRequest, onNotify }) {
  const [conversations, setConversations] = useState([]);
  const [activeUsername, setActiveUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const messageEndRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiRequest("/api/conversations");
      setConversations(data);
      setActiveUsername((current) => data.some((person) => person.username === current)
        ? current
        : data[0]?.username || "");
      setLoadError("");
    } catch (error) {
      setLoadError(`Could not load conversations: ${error.message}`);
    }
  }, [apiRequest]);

  const loadMessages = useCallback(async () => {
    if (!activeUsername) {
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest(`/api/messages?with_username=${encodeURIComponent(activeUsername)}`);
      setMessages(data);
      setLoadError("");
    } catch (error) {
      setLoadError(`Could not load messages: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [activeUsername, apiRequest]);

  useEffect(() => {
    loadConversations();
    const timer = setInterval(loadConversations, 15000);
    return () => clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    setLoading(true);
    loadMessages();
    const timer = setInterval(loadMessages, 10000);
    return () => clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  const activeConversation = conversations.find((person) => person.username === activeUsername);
  const filteredConversations = useMemo(() => conversations.filter((person) => {
    const matchesRole = roleFilter === "all" || person.role === roleFilter;
    const matchesSearch = !search.trim()
      || `${person.full_name} ${person.username}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesRole && matchesSearch;
  }), [conversations, roleFilter, search]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!content.trim() || !activeUsername || sending) return;
    setSending(true);
    try {
      const message = await apiRequest("/api/messages", {
        method: "POST",
        body: JSON.stringify({ recipient_username: activeUsername, content }),
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
    <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 p-3 sm:p-5">
      <section className="flex min-h-[65vh] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <aside className={`w-full shrink-0 border-r border-slate-200 md:w-80 ${mobileThreadOpen ? "hidden md:flex md:flex-col" : "flex flex-col"}`}>
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              <div>
                <h2 className="font-semibold text-slate-900">Direct Messages</h2>
                <p className="text-xs text-slate-500">Coordinators, supervisors and advisers</p>
              </div>
              <button
                type="button"
                onClick={loadConversations}
                aria-label="Refresh conversations"
                className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search conversations"
                placeholder="Search people…"
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <label htmlFor="chat-role-filter" className="sr-only">Filter conversations by role</label>
            <select
              id="chat-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All roles</option>
              {ROLES.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto" aria-label="Conversation list">
            {loadError && <p role="status" className="p-3 text-xs text-rose-600">{loadError}</p>}
            {filteredConversations.map((person) => (
              <button
                key={person.username}
                type="button"
                onClick={() => { setActiveUsername(person.username); setMobileThreadOpen(true); }}
                className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${activeUsername === person.username ? "bg-blue-50" : ""}`}
              >
                <Avatar person={person} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{person.full_name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ROLE_STYLES[person.role] || "bg-slate-100 text-slate-700"}`}>
                      {formatRole(person.role)}
                    </span>
                    <span className="truncate text-[11px] text-slate-400">{person.username}</span>
                  </span>
                </span>
              </button>
            ))}
            {!loading && filteredConversations.length === 0 && (
              <p className="p-5 text-center text-sm text-slate-400">
                {conversations.length ? "No conversations match this filter." : "No other staff accounts are available yet."}
              </p>
            )}
          </div>
        </aside>

        <div className={`min-w-0 flex-1 flex-col ${mobileThreadOpen ? "flex" : "hidden md:flex"}`}>
          {activeConversation ? (
            <>
              <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMobileThreadOpen(false)}
                  aria-label="Back to conversations"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar person={activeConversation} className="h-9 w-9" />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{activeConversation.full_name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${ROLE_STYLES[activeConversation.role] || "bg-slate-100 text-slate-700"}`}>
                    {formatRole(activeConversation.role)}
                  </span>
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4" aria-live="polite">
                {loadError && <p role="status" className="text-sm text-rose-600">{loadError}</p>}
                {loading && messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">Start a conversation with {activeConversation.full_name}.</p>
                ) : messages.map((message) => {
                  const ownMessage = message.sender_username === currentUser.username;
                  return (
                    <article key={message.id} className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm ${ownMessage ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"}`}>
                        <div className={`mb-1 flex items-center gap-2 text-[10px] ${ownMessage ? "text-blue-100" : "text-slate-500"}`}>
                          <span className="font-semibold">{message.sender_name}</span>
                          <span>{formatRole(message.sender_role)}</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                        <time dateTime={message.created_at} className={`mt-1 block text-right text-[10px] ${ownMessage ? "text-blue-100" : "text-slate-400"}`}>
                          {formatTimestamp(message.created_at)}
                        </time>
                      </div>
                    </article>
                  );
                })}
                <div ref={messageEndRef} />
              </div>
              <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white p-3 sm:p-4">
                <div className="flex items-end gap-2">
                  <label htmlFor="chat-message" className="sr-only">Message</label>
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
                    placeholder={`Message ${activeConversation.full_name}…`}
                    className="min-h-11 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={sending || !content.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">{sending ? "Sending…" : "Send"}</span>
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
              </form>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-400">
              <MessageSquare className="mb-3 h-10 w-10 text-slate-200" />
              <p className="text-sm">Select a staff member to start a direct conversation.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
