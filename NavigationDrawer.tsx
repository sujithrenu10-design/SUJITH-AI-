import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  Code2,
  Download,
  FolderOpen,
  FolderPlus,
  Key,
  Lock,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import { useState } from "react";
import { AppLogo } from "./AppLogo";
import type { Chat } from "../lib/types";
import { cn } from "../utils/cn";

export type PageMode = "builder" | "chat-page";

export function NavigationDrawer({
  chats,
  activeId,
  busy,
  pageMode,
  onSelectPageMode,
  onClose,
  onNew,
  onSelect,
  onDelete,
  onStartRename,
  onTogglePin,
  onToggleArchive,
  onToggleLock,
  onAssignProject,
  onSettings,
  onOpenApiKeyGenerator,
  onExport,
}: {
  chats: Chat[];
  activeId: string;
  busy: boolean;
  pageMode: PageMode;
  onSelectPageMode: (mode: PageMode) => void;
  onClose: () => void;
  onNew: () => void;
  onSelect: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
  onStartRename: (chat: Chat) => void;
  onTogglePin: (chat: Chat) => void;
  onToggleArchive: (chat: Chat) => void;
  onToggleLock: (chat: Chat) => void;
  onAssignProject: (chat: Chat) => void;
  onSettings: () => void;
  onOpenApiKeyGenerator: () => void;
  onExport?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [menuTarget, setMenuTarget] = useState<{ chat: Chat; top: number; right: number } | null>(null);

  const archivedCount = chats.filter((chat) => Boolean(chat.archived)).length;
  const visible = chats
    .filter((chat) => (showArchived ? true : !chat.archived || chat.id === activeId))
    .filter((chat) =>
      `${chat.title} ${chat.projectTag ?? ""} ${chat.messages.map((message) => message.content).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));

  return (
    <div className="absolute inset-0 z-[70] flex">
      <button
        type="button"
        onClick={() => {
          setMenuTarget(null);
          onClose();
        }}
        aria-label="Dismiss navigation"
        className="animate-fade-in absolute inset-0 cursor-default bg-black/25 backdrop-blur-[2px]"
      />
      <aside
        className="animate-drawer-in relative flex h-full w-[min(86%,350px)] flex-col border-r border-[var(--line)] bg-[var(--surface)] shadow-[24px_0_60px_-28px_rgba(0,0,0,.3)]"
        aria-label="Navigation"
      >
        <header className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 pb-4 pt-[max(18px,env(safe-area-inset-top))]">
          <AppLogo size={26} />
          <span className="flex-1 text-[16px] tracking-[-.02em] text-[var(--ink-soft)]">SUJITH AI</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => {
              setMenuTarget(null);
              onClose();
            }}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-3 pb-3 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuTarget(null);
              onClose();
              onNew();
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] text-[12px] font-medium text-[var(--surface)] disabled:opacity-40"
          >
            <Plus size={16} />
            {pageMode === "chat-page" ? "New chat" : "New build project"}
          </button>
          <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-[var(--line)] px-3 text-[var(--muted)]">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={pageMode === "chat-page" ? "Search chats" : "Search builder projects"}
              placeholder={pageMode === "chat-page" ? "Search chats" : "Search builder projects"}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--ink)] outline-none"
            />
          </label>
        </div>

        <p className="px-5 pb-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Pages</p>
        <div className="space-y-1 px-2 pb-3">
          <button
            type="button"
            onClick={() => {
              setMenuTarget(null);
              onSelectPageMode("chat-page");
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition",
              pageMode === "chat-page"
                ? "bg-[var(--blue-soft)] text-[var(--blue-text)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            )}
          >
            <MessageCircle size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">Chat Page</span>
              <span className="block text-[9.5px] opacity-75">Normal AI Chat · Image &amp; Video</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuTarget(null);
              onSelectPageMode("builder");
              onClose();
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition",
              pageMode === "builder"
                ? "bg-[var(--blue-soft)] text-[var(--blue-text)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            )}
          >
            <Code2 size={15} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">Website &amp; Android Builder</span>
              <span className="block text-[9.5px] opacity-75">App Builder · Preview · Editor · Terminal</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuTarget(null);
              onOpenApiKeyGenerator();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          >
            <Key size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold">NoTrack.ai API Key Generator</span>
              <span className="block text-[9.5px] opacity-75">Generate &amp; Activate Key</span>
            </span>
          </button>
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
            {pageMode === "chat-page" ? "Chat Conversations" : "Builder Projects"}
          </p>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-[9.5px] font-medium text-[var(--blue-text)] hover:underline"
            >
              {showArchived ? "Hide archived" : `Archived (${archivedCount})`}
            </button>
          )}
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
          {visible.map((chat) => (
            <div
              key={chat.id}
              className={cn("group mb-1 flex items-center rounded-xl", chat.id === activeId && "bg-[var(--surface-soft)]")}
            >
              <button
                type="button"
                onClick={() => {
                  onSelect(chat);
                  setMenuTarget(null);
                }}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left"
              >
                <MessageSquare size={14} className="shrink-0 text-[var(--muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[11px] font-medium text-[var(--ink-soft)]">{chat.title}</span>
                    {chat.pinned && <Pin size={10} className="shrink-0 text-[var(--blue)]" aria-label="Pinned" />}
                    {chat.locked && <Lock size={10} className="shrink-0 text-[var(--muted)]" aria-label="Locked" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[9px] text-[var(--muted)]">
                    {chat.messages.filter((message) => message.role === "user").length} requests
                    {chat.projectTag ? ` · ${chat.projectTag}` : ""}
                    {chat.archived ? " · Archived" : ""}
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(event) => {
                  event.stopPropagation();
                  if (menuTarget?.chat.id === chat.id) {
                    setMenuTarget(null);
                  } else {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const menuHeight = 290;
                    const top =
                      rect.bottom + menuHeight > window.innerHeight
                        ? Math.max(16, rect.top - menuHeight + 30)
                        : Math.max(16, rect.top - 10);
                    const right = Math.max(16, Math.min(window.innerWidth - 235, window.innerWidth - rect.right - 20));
                    setMenuTarget({
                      chat,
                      top,
                      right,
                    });
                  }
                }}
                aria-label={`Options for ${chat.title}`}
                className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-muted)] disabled:opacity-25"
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
          ))}
          {!visible.length && <p className="px-3 py-8 text-center text-[11px] text-[var(--muted)]">No matching chats.</p>}
        </div>

        {menuTarget && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[85] cursor-default"
              onClick={() => setMenuTarget(null)}
              aria-label="Dismiss menu"
            />
            <div
              className="animate-menu-in fixed z-[90] w-[220px] rounded-[22px] border border-black/[0.08] bg-white p-2 shadow-[0_12px_45px_-6px_rgba(0,0,0,0.22)] dark:border-white/10 dark:bg-[#1a1f2c]"
              style={{ top: `${menuTarget.top}px`, right: `${menuTarget.right}px` }}
            >
              <button
                type="button"
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onTogglePin(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#1e232d] transition-colors hover:bg-black/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.06]"
              >
                {menuTarget.chat.pinned ? (
                  <PinOff size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                ) : (
                  <Pin size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                )}
                <span className="flex-1">{menuTarget.chat.pinned ? "Unpin" : "Pin"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onStartRename(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#1e232d] transition-colors hover:bg-black/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.06]"
              >
                <Pencil size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                <span className="flex-1">Rename</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onAssignProject(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#1e232d] transition-colors hover:bg-black/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.06]"
              >
                <FolderPlus size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                <span className="flex-1">{menuTarget.chat.projectTag ? "Edit project tag" : "Add to project"}</span>
                <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-[#6b7280] dark:text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onToggleArchive(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#1e232d] transition-colors hover:bg-black/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.06]"
              >
                {menuTarget.chat.archived ? (
                  <ArchiveRestore size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                ) : (
                  <Archive size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                )}
                <span className="flex-1">{menuTarget.chat.archived ? "Unarchive" : "Archive"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onToggleLock(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#1e232d] transition-colors hover:bg-black/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.06]"
              >
                {menuTarget.chat.locked ? (
                  <Unlock size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                ) : (
                  <ShieldCheck size={18} strokeWidth={1.8} className="shrink-0 text-[#1e232d] dark:text-slate-100" />
                )}
                <span className="flex-1">{menuTarget.chat.locked ? "Unlock chat" : "Lock chat"}</span>
              </button>

              <button
                type="button"
                disabled={Boolean(menuTarget.chat.locked)}
                onClick={() => {
                  const targetChat = menuTarget.chat;
                  setMenuTarget(null);
                  onDelete(targetChat);
                }}
                className="flex h-[46px] w-full items-center gap-3.5 rounded-[16px] px-3.5 text-left text-[14.5px] font-normal text-[#ef4444] transition-colors hover:bg-red-50/70 disabled:opacity-40 dark:hover:bg-red-950/30"
              >
                <Trash2 size={18} strokeWidth={1.8} className="shrink-0 text-[#ef4444]" />
                <span className="flex-1">Delete</span>
              </button>
            </div>
          </>
        )}

        <footer className="space-y-1 border-t border-[var(--line)] px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => {
              setMenuTarget(null);
              onOpenApiKeyGenerator();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/70 transition"
          >
            <Key size={15} />
            NoTrack.ai API Key Generator
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuTarget(null);
              onSettings();
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          >
            <Settings2 size={16} />
            Settings
          </button>
          {onExport && (
            <button
              type="button"
              onClick={() => {
                setMenuTarget(null);
                onExport();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[11px] text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink-soft)]"
            >
              <Download size={14} />
              Export workspace backup
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 pt-1.5 text-[9px] text-[var(--muted)]">
            <FolderOpen size={11} />
            Local source builder. No account required.
          </div>
        </footer>
      </aside>
    </div>
  );
}
