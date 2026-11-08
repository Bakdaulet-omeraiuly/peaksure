"use client";
import { useEffect, useState } from "react";
import { fetchJson } from "@/engine/data";
import { useStudio } from "@/state/store";

interface YearRow { year: number; reon_usd: number; peaksure_usd: number; delta_usd: number; delta_lo_usd: number; delta_hi_usd: number; reon_capture: number; peaksure_capture: number }
interface YearData { n_runs: number; rows: YearRow[] }
const money = (v: number) => `${v < 0 ? "−" : v > 0 ? "+" : ""}$${Math.abs(v) < 500 ? Math.round(Math.abs(v)).toLocaleString() : `${Math.round(Math.abs(v) / 1000).toLocaleString()}k`}`;

export default function YearlyCompare() {
  const [data, setData] = useState<YearData | null>(null);
  const age = useStudio((s) => s.age);
  const set = useStudio((s) => s.set);
  useEffect(() => { fetchJson<YearData>("/data/yearly.json").then(setData); }, []);
  if (!data) return null;
  const rows = data.rows, selected = rows.find((r) => r.year === age) ?? rows[0];
  const values = rows.flatMap((r) => [r.reon_usd, r.peaksure_usd]);
  const lo = Math.min(...values) * 0.96, hi = Math.max(...values) * 1.04;
  const W = 900, H = 180, left = 48, right = 16, top = 18, bottom = 30;
  const x = (i: number) => left + i * (W - left - right) / (rows.length - 1);
  const y = (v: number) => top + (hi - v) * (H - top - bottom) / (hi - lo);
  const path = (key: "reon_usd" | "peaksure_usd") => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(" ");
  return (
    <section className="surface mt-4 overflow-hidden">
      <div className="panel-h"><span className="micro">15-year modeled comparison</span><span className="badge">{data.n_runs} paired runs</span></div>
      <div className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 text-[12px] text-muted">
          <span>B · CES-sized bypass model versus C · same model + PeakSure · annual savings</span>
          <span className="num">Year {selected.year}: B · bypass ${Math.round(selected.reon_usd / 1000)}k · C · + PeakSure ${Math.round(selected.peaksure_usd / 1000)}k · Δ {money(selected.delta_usd)}</span>
        </div>
        <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label="Annual modeled savings: CES-sized bypass baseline versus bypass with PeakSure">
          {[0, 0.5, 1].map((f) => { const v = lo + (hi - lo) * f; return <g key={f}><line x1={left} x2={W-right} y1={y(v)} y2={y(v)} stroke="#e3e9e5"/><text x={left-7} y={y(v)+4} textAnchor="end" fontSize="10" fill="#718178">${Math.round(v / 1000)}k</text></g>; })}
          <path d={path("reon_usd")} fill="none" stroke="#85949c" strokeWidth="2" />
          <path d={path("peaksure_usd")} fill="none" stroke="#16825b" strokeWidth="2" />
          {rows.map((r, i) => <g key={r.year} onClick={() => set({ age: r.year, playing: false })} style={{ cursor: "pointer" }}>
            {r.year === age && <line x1={x(i)} x2={x(i)} y1={top} y2={H-bottom} stroke="#a9bfb4" strokeDasharray="3 3" />}
            <circle cx={x(i)} cy={y(r.reon_usd)} r={r.year === age ? 4 : 2.5} fill="#85949c" />
            <circle cx={x(i)} cy={y(r.peaksure_usd)} r={r.year === age ? 4 : 2.5} fill="#16825b" />
            <rect x={x(i)-12} y={top} width="24" height={H-top-bottom} fill="transparent" />
            <text x={x(i)} y={H-9} textAnchor="middle" fontSize="10" fill={r.year === age ? "#16825b" : "#718178"}>{r.year}</text>
          </g>)}
        </svg></div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted mt-1"><span>● B · CES-sized bypass model</span><span className="text-[#16825b]">● C · bypass + PeakSure</span><span>Click a year to update both modeled batteries above.</span></div>
        <p className="text-[11px] text-faint mt-2">Annual values average {data.n_runs} paired simulations. The bypass hardware and baseline control rule are assumed; this is not measured REON performance. Positive, zero and negative differences are shown.</p>
      </div>
    </section>
  );
}
