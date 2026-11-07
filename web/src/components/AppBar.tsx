"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppBar({ context }: { context?: React.ReactNode }) {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link href={href} className="h-[44px] px-3 flex items-center text-[13px]"
          style={{ color: path === href ? "var(--text)" : "var(--muted)", boxShadow: path === href ? "inset 0 -2px 0 var(--accent)" : "none" }}>
      {label}
    </Link>
  );
  return (
    <header className="h-[44px] shrink-0 flex items-center border-b border-line bg-panel px-3 gap-4">
      <div className="flex items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <rect x="1" y="4" width="14" height="10" rx="2" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
          <rect x="15.5" y="7" width="2" height="4" rx="0.8" fill="var(--accent)" />
          <path d="M5 11 L7.5 8 L9.5 10 L12 6.5" stroke="var(--accent)" strokeWidth="1.6" fill="none" />
        </svg>
        <span className="font-semibold text-[14px] tracking-tight">PeakSure</span>
        <span className="text-faint text-[13px]">Studio</span>
      </div>
      <nav className="flex">{tab("/", "Studio")}{tab("/results", "Results")}{tab("/method", "Method")}</nav>
      <div className="flex-1 min-w-0 text-[12px] text-muted truncate">{context}</div>
      <a href="https://github.com/Bakdaulet-omeraiuly/peaksure" className="text-[12px] text-faint hover:text-ink">GitHub</a>
      <span className="badge">simulated · not endorsed by REON</span>
    </header>
  );
}
