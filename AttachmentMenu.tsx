import { Camera, FileText, FolderOpen, Image } from "lucide-react";

/**
 * Popover shown from the composer "+" button.
 * Visual reference: rounded white card, four icon rows with circular grey icon tiles,
 * soft shadow, and a small tail pointing down to the "+" button.
 */
export function AttachmentMenu({
  open,
  onClose,
  onCamera,
  onPhotos,
  onFiles,
  onDocument,
}: {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onPhotos: () => void;
  onFiles: () => void;
  onDocument: () => void;
}) {
  if (!open) return null;

  const row =
    "flex w-full items-center gap-[18px] rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-soft)] active:bg-[var(--surface-muted)]";
  const tile =
    "grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-[#e9e9ec] text-[#14151a] dark:bg-[#33363d] dark:text-[#f1f3f7]";
  const label = "text-[15px] font-normal leading-none tracking-[-0.01em] text-[#1e1f24] dark:text-[#eef0f4]";

  return (
    <div className="absolute bottom-[calc(100%+10px)] left-0 z-50">
      <button
        type="button"
        className="fixed inset-0 z-40 cursor-default bg-transparent"
        onClick={onClose}
        aria-label="Close attachment options"
        tabIndex={-1}
      />
      <div
        role="menu"
        aria-label="Add an attachment"
        className="animate-menu-in relative z-50 w-[212px] rounded-[22px] bg-[#ffffff] px-[8px] pb-[10px] pt-[10px] shadow-[0_18px_44px_-12px_rgba(24,30,48,0.30),0_3px_8px_rgba(24,30,48,0.05)] dark:bg-[#1b1d22]"
      >
        <button type="button" role="menuitem" className={row} onClick={() => { onClose(); onCamera(); }}>
          <span className={tile}><Camera size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className={label}>Camera</span>
        </button>
        <button type="button" role="menuitem" className={row} onClick={() => { onClose(); onPhotos(); }}>
          <span className={tile}><Image size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className={label}>Photos</span>
        </button>
        <button type="button" role="menuitem" className={row} onClick={() => { onClose(); onFiles(); }}>
          <span className={tile}><FolderOpen size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className={label}>Files</span>
        </button>
        <button type="button" role="menuitem" className={row} onClick={() => { onClose(); onDocument(); }}>
          <span className={tile}><FileText size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <span className={label}>Document</span>
        </button>
        <span
          aria-hidden="true"
          className="absolute -bottom-[6px] left-[22px] h-3.5 w-3.5 rotate-45 rounded-[3px] bg-[#ffffff] dark:bg-[#1b1d22]"
        />
      </div>
    </div>
  );
}
