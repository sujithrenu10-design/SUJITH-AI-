import { useId } from "react";
import { COMPANY_META, type CompanyId } from "../lib/companyLogos";

export function CompanyLogo({
  company,
  size = 18,
  className = "",
}: {
  company: CompanyId;
  size?: number;
  className?: string;
}) {
  const gradId = useId().replace(/:/g, "");
  const meta = COMPANY_META[company] ?? COMPANY_META.notrack;

  if (company === "gemini") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={meta.name}
        className={`shrink-0 ${className}`}
      >
        <defs>
          <linearGradient id={`gemini-${gradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1C7DF4" />
            <stop offset="52%" stopColor="#5D74EC" />
            <stop offset="100%" stopColor="#9A6CD9" />
          </linearGradient>
        </defs>
        <path d={meta.path} fill={`url(#gemini-${gradId})`} />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={meta.name}
      className={`shrink-0 ${className}`}
    >
      <path d={meta.path} fill={meta.color} />
    </svg>
  );
}
