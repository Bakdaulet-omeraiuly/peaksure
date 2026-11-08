"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AppBar({ context }: { context?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="bg-panel border-b border-line">
      <div className="max-w-[1540px] mx-auto px-4 sm:px-8 lg:px-12 min-h-[68px] flex flex-wrap items-center justify-between gap-x-8 gap-y-1 py-2">
        <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="PeakSure home">
          <span className="w-9 h-9 rounded-lg bg-[#153b2f] text-white grid place-items-center font-bold text-[17px] tracking-tight">P<span className="text-[#9cdbc0]">.</span></span>
          <span className="font-semibold text-[19px] tracking-tight text-ink">PeakSure</span>
        </Link>
        <nav className="site-nav flex items-center gap-1" aria-label="Main navigation">
          {[["/", "Proposal"], ["/compare", "Compare"], ["/assumptions", "Assumptions"], ["/method", "Method"]].map(([href, label]) => (
            <Link key={href} href={href} className={`px-3 py-2 rounded-md text-[13px] font-medium whitespace-nowrap ${path === href ? "bg-[#e8f2ec] text-[#0c6548]" : "text-muted hover:text-ink hover:bg-panel-2"}`}>{label}</Link>
          ))}
        </nav>
        <div className="hidden lg:flex items-center gap-4 text-[11px] text-faint">
          {context && <span className="max-w-[280px] truncate">{context}</span>}
          <span className="badge">Independent simulation</span>
        </div>
      </div>
    </header>
  );
}
