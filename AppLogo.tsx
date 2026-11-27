import { useId } from "react";

export function AppLogo({ size = 25, className = "" }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="SUJITH AI logo">
      <defs><linearGradient id={`logo-${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#5095ff" /><stop offset="100%" stopColor="#176bdd" /></linearGradient></defs>
      <path d="M12 1.8c.7 5.6 4.6 9.5 10.2 10.2-5.6.7-9.5 4.6-10.2 10.2-.7-5.6-4.6-9.5-10.2-10.2C7.4 11.3 11.3 7.4 12 1.8Z" fill={`url(#logo-${id})`} />
    </svg>
  );
}
