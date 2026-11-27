import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  fullScreen,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  fullScreen?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select, a[href], textarea, [tabindex="0"]'
        ),
      ].filter((element) => element.offsetParent !== null);
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex",
        fullScreen ? "h-full w-full items-stretch justify-stretch" : "items-end justify-center"
      )}
    >
      {!fullScreen && (
        <button
          type="button"
          className="animate-fade-in absolute inset-0 cursor-default bg-black/30 backdrop-blur-[2px]"
          onClick={onClose}
          aria-label={`Dismiss ${title}`}
          tabIndex={-1}
        />
      )}
      <section
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative flex flex-col bg-[var(--surface)] outline-none",
          fullScreen
            ? "h-full w-full max-h-none rounded-none border-0"
            : "animate-fade-up max-h-[93%] w-full overflow-hidden rounded-t-[28px] border-t border-[var(--line)] shadow-[0_-24px_64px_-25px_rgba(0,0,0,.3)]"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {!fullScreen && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--line)]" />}
        <header
          className={cn(
            "flex shrink-0 items-start gap-3 border-b border-[var(--line)] px-5",
            fullScreen ? "pb-3.5 pt-[max(16px,env(safe-area-inset-top))]" : "pb-3 pt-3"
          )}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold tracking-[-.02em] text-[var(--ink)]">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-button -mr-2 -mt-1" aria-label={`Close ${title}`}>
            <X size={19} />
          </button>
        </header>
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}
