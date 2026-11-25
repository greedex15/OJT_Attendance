import React, { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Calendar,
  Check,
  ChevronLeft,
  FileText,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Plus,
  Strikethrough,
  Underline as UnderlineIcon,
  X,
} from "lucide-react";

// ─── Toolbar Button ───────────────────────────────────────────────────────────
function ToolBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-sm transition select-none
        ${active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
        }`}
    >
      {children}
    </button>
  );
}

// ─── Rich Text Editor Toolbar ─────────────────────────────────────────────────
function EditorToolbar({ editor }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap gap-1.5 p-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
      <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
        <Bold className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
        <Italic className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
        <UnderlineIcon className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
        <Strikethrough className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")} title="Highlight">
        <Highlighter className="w-4 h-4" />
      </ToolBtn>

      <div className="w-px bg-slate-200 mx-0.5 self-stretch" />

      <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
        <AlignLeft className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center">
        <AlignCenter className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
        <AlignRight className="w-4 h-4" />
      </ToolBtn>

      <div className="w-px bg-slate-200 mx-0.5 self-stretch" />

      <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
        <List className="w-4 h-4" />
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">
        <ListOrdered className="w-4 h-4" />
      </ToolBtn>

      <div className="w-px bg-slate-200 mx-0.5 self-stretch" />

      {/* Heading levels */}
      {[1, 2, 3].map((level) => (
        <ToolBtn
          key={level}
          onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          active={editor.isActive("heading", { level })}
          title={`Heading ${level}`}
        >
          <span className="text-xs font-bold">H{level}</span>
        </ToolBtn>
      ))}
    </div>
  );
}

// ─── Journal Entry Card ───────────────────────────────────────────────────────
function journalExtensions() {
  return [
    StarterKit,
    Underline,
    Highlight,
    TextStyle,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
  ];
}

function JournalContent({ content }) {
  const editor = useEditor({
    extensions: journalExtensions(),
    content: content || "",
    editable: false,
    editorProps: { attributes: { class: "journal-content prose prose-sm max-w-none text-slate-800" } },
  });
  return <EditorContent editor={editor} />;
}

function JournalCard({ entry, onEdit, isAdmin }) {
  const dateLabel = new Date(entry.entry_date + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-blue-700 truncate">{dateLabel}</div>
            {isAdmin && (
              <div className="text-[11px] text-slate-500 truncate">{entry.owner_name} · {entry.owner_username}</div>
            )}
          </div>
        </div>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-600 transition"
            title="Edit entry"
            aria-label="Edit journal entry"
          >
            <FileText className="w-4 h-4" />
          </button>
        )}
      </div>
      {entry.title && (
        <div className="px-4 pt-3 font-semibold text-slate-900 text-base">{entry.title}</div>
      )}
      <section className="px-4 py-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">What Happened Today</h3>
        <JournalContent content={entry.what_happened_today || entry.content_html} />
        {!entry.what_happened_today && !entry.content_html && <p className="text-sm italic text-slate-400">No entry</p>}
      </section>
      <section className="px-4 pb-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">Achievements</h3>
        <JournalContent content={entry.achievements} />
        {!entry.achievements && <p className="text-sm italic text-slate-400">No achievements recorded</p>}
      </section>
    </div>
  );
}

// ─── Journal Editor Modal ─────────────────────────────────────────────────────
function JournalEditorModal({ entry, onSave, onClose, isSaving }) {
  const currentDate = new Date();
  const today = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  const [title, setTitle] = useState(entry?.title || "");
  const [entryDate, setEntryDate] = useState(entry?.entry_date || today);

  const happenedEditor = useEditor({
    extensions: journalExtensions(),
    content: entry?.what_happened_today || entry?.content_html || "",
    editorProps: {
      attributes: {
        class: "journal-editor min-h-[150px] px-4 py-3 outline-none text-slate-800 prose prose-sm max-w-none",
        "aria-label": "What Happened Today",
      },
    },
  });
  const achievementsEditor = useEditor({
    extensions: journalExtensions(),
    content: entry?.achievements || "",
    editorProps: {
      attributes: {
        class: "journal-editor min-h-[120px] px-4 py-3 outline-none text-slate-800 prose prose-sm max-w-none",
        "aria-label": "Achievements",
      },
    },
  });

  async function handleSave() {
    if (!happenedEditor || !achievementsEditor) return;
    await onSave({
      id: entry?.id,
      entry_date: entryDate,
      title: title.trim(),
      what_happened_today: happenedEditor.getHTML(),
      achievements: achievementsEditor.getHTML(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[95dvh] sm:max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-slate-900">{entry ? "Edit Journal Entry" : "New Journal Entry"}</span>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fields */}
        <div className="px-4 pt-3 pb-2 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Date</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-[2]">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Day 3 – UI design & testing"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3 min-h-0">
          <section className="border border-slate-200 rounded-xl">
            <h3 className="px-3 pt-3 text-xs font-bold uppercase tracking-wide text-slate-600">What Happened Today</h3>
            <EditorToolbar editor={happenedEditor} />
            <EditorContent editor={happenedEditor} />
          </section>
          <section className="border border-slate-200 rounded-xl">
            <h3 className="px-3 pt-3 text-xs font-bold uppercase tracking-wide text-slate-600">Achievements</h3>
            <EditorToolbar editor={achievementsEditor} />
            <EditorContent editor={achievementsEditor} />
          </section>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 flex gap-3 shrink-0 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {isSaving ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Journal Page ────────────────────────────────────────────────────────
export default function JournalPage({ currentUser, apiRequest, onNotify, onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | entry object | "new"
  const [isSaving, setIsSaving] = useState(false);
  const isAdmin = currentUser?.role === "admin";

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/api/journals");
      setEntries(data);
    } catch (err) {
      onNotify(`Failed to load journal: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, onNotify]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  async function handleSave({ id, entry_date, title, what_happened_today, achievements }) {
    setIsSaving(true);
    try {
      if (id) {
        await apiRequest(`/api/journals/${id}`, {
          method: "PUT",
          body: JSON.stringify({ entry_date, title, what_happened_today, achievements }),
        });
        onNotify("Journal entry updated!", "success");
      } else {
        await apiRequest("/api/journals", {
          method: "POST",
          body: JSON.stringify({ entry_date, title, what_happened_today, achievements }),
        });
        onNotify("Journal entry saved!", "success");
      }
      setEditing(null);
      await fetchEntries();
    } catch (err) {
      onNotify(`Save failed: ${err.message}`, "error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Page Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-bold text-slate-900 text-base leading-tight">
              {isAdmin ? "All Trainee Journals" : "My OJT Journal"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAdmin
                ? "View all trainee daily journal entries"
                : "Write your daily achievements, tasks & reflections"}
            </p>
          </div>
        </div>
        {!isAdmin && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Entry</span>
            <span className="sm:hidden">New</span>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center py-16 text-sm text-slate-400">Loading journal entries…</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-600 font-semibold">No journal entries yet</p>
            {!isAdmin && (
              <p className="text-slate-400 text-sm mt-1">
                Tap <strong>New Entry</strong> to write your first daily journal.
              </p>
            )}
          </div>
        ) : (
          entries.map((entry) => (
            <JournalCard
              key={entry.id}
              entry={entry}
              onEdit={(e) => setEditing(e)}
              isAdmin={isAdmin}
            />
          ))
        )}
      </div>

      {/* Editor Modal */}
      {editing && (
        <JournalEditorModal
          entry={editing === "new" ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
