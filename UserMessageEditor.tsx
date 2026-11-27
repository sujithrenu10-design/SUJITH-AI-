import { useEffect, useRef, useState } from "react";
import { Check, Copy, Pencil } from "lucide-react";

export function InlineMessageEditor({
  initialValue,
  enterToSend,
  busy,
  hasAttachments = false,
  onCancel,
  onSend,
}: {
  initialValue: string;
  enterToSend: boolean;
  busy: boolean;
  hasAttachments?: boolean;
  onCancel: () => void;
  onSend: (editedText: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  const trimmed = value.trim();
  const canSubmit = !busy && (trimmed.length > 0 || hasAttachments);

  return (
    <div className="w-full max-w-[96%] self-end animate-fade-in">
      <div className="rounded-[22px] border-[1.5px] border-[#2563eb] bg-white p-[2.5px] shadow-[0_2px_10px_-4px_rgba(37,99,235,0.18)] dark:bg-slate-900">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          maxLength={16000}
          aria-label="Edit message to resend"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey && enterToSend && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSubmit) onSend(trimmed);
            }
          }}
          className="thin-scrollbar block min-h-[96px] w-full resize-y rounded-[18px] border-[1.5px] border-[#2563eb] bg-white px-4 py-3 text-[15.5px] font-normal leading-[1.52] text-[#151b26] outline-none placeholder:text-[#64748b] dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-[40px] rounded-full border border-[#d6deea] bg-white px-5 text-[14px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            if (canSubmit) onSend(trimmed);
          }}
          className="h-[40px] rounded-full bg-[#2563eb] px-6 text-[14px] font-semibold text-white shadow-xs transition hover:bg-[#1d4ed8] active:scale-[0.98] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export function UserMessageActions({
  content,
  busy,
  onCopy,
  onEdit,
}: {
  content: string;
  busy: boolean;
  onCopy: (text: string) => void;
  onEdit: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex items-center justify-end gap-0.5 pr-1">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy message"
        title="Copy"
        className="grid h-7 w-7 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 hover:text-[#151b26] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
      >
        {copied ? <Check size={13.5} className="text-[#16a34a]" /> : <Copy size={13.5} strokeWidth={1.85} />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onEdit}
        aria-label="Edit and resend message"
        title="Edit & resend"
        className="grid h-7 w-7 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 hover:text-[#151b26] disabled:opacity-35 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
      >
        <Pencil size={13.5} strokeWidth={1.85} />
      </button>
    </div>
  );
}
