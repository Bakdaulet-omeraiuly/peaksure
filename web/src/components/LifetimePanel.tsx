"use client";
// Over the battery's life (challenge brief: capacity retention vs a 70% threshold, energy recovered,
// economic and environmental value, chemistry sensitivity). All numbers read from generated results.
import { useEffect, useState } from "react";
import { fetchJson } from "@/engine/data";

type Band = { cond: string; sim_year: number; p5: number; p50: number; p95: number };
type T1 = { cond: string; aug: number[] | number; d_true: number[] | number; savings: number[] | number };
type Sens = { tag: string; v1: number; v2: number; sav_a: number; sav_c: number };
type Dec = { component: string; mean: number };
type Chem = { name: string; price: { low: number; central: number; high: number }; npv_full: { A: number; C: number }; floor_min_soc: number };
type C = { e_nom: number; eol: number; start: number; co2: number[]; augCost: number };

const first = (v: number[] | number) => (Array.isArray(v) ? v[0] : v);
const k = (x: number, d = 0) => x.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const COL: Record<string, string> = { A: "#687a83", B: "#4f7f9b", C: "#137454" };
const NAME: Record<string, string> = { A: "A · Conventional", B: "B · REON EBS", C: "C · REON EBS + PeakSure" };

export default function LifetimePanel() {
  const [r, setR] = useState<{ bands: Band[]; t1: T1[]; sens: Sens[]; dec: Dec[] } | null>(null);
  const [chem, setChem] = useState<Chem[] | null>(null);
  const [c, setC] = useState<C | null>(null);
  useEffect(() => {
    fetchJson<{ bands: Band[]; t1: T1[]; sens: Sens[]; dec: Dec[] }>("/data/results.json").then(setR);
    fetchJson<{ chemistries: Chem[]; source: { config: { e_nom_kwh: number; eol_retention: number; start_year: number; co2_kg_per_kwh: number[]; augment_cost_kwh: number } } }>("/data/strategy.json")
      .then((s) => { setChem(s.chemistries); const g = s.source.config; setC({ e_nom: g.e_nom_kwh, eol: g.eol_retention, start: g.start_year, co2: g.co2_kg_per_kwh, augCost: g.augment_cost_kwh }); });
  }, []);
  if (!r || !chem || !c) return null;
  const t = (cond: string) => r.t1.find((x) => x.cond === cond)!;
  const augA = first(t("A").aug), augB = first(t("B").aug);
  const dA = first(t("A").d_true), dB = first(t("B").d_true);
  const avoidedKwh = augA - augB;
  // lowest median deliverable capacity over the horizon, as a share of nameplate
  const lowest = (cd: string) => Math.min(...r.bands.filter((b) => b.cond === cd).map((b) => b.p50 / c.e_nom));
  const conds = ["A", "B", "C"];
  const years = Array.from(new Set(r.bands.map((b) => b.sim_year))).sort((a, b) => a - b);
  const W = 560, H = 190, L = 40, T = 10, IW = W - L - 10, IH = H - T - 26;
  const yMin = 0.6, yMax = 1.0;
  const X = (y: number) => L + (y / (years[years.length - 1] || 1)) * IW;
  const Y = (v: number) => T + IH * (1 - (v - yMin) / (yMax - yMin));
  const ret = (b: Band, q: "p5" | "p50" | "p95") => b[q] / c.e_nom;
  const decV = (p: string) => r.dec.find((d) => d.component.startsWith(p))?.mean ?? 0;
  const lfp = r.sens.find((s) => s.tag === "chem_LFP");
  const chemRows = chem.map((ch) => ({
    ...ch, cellValue: ch.name === "LFP" ? (lfp ? lfp.v1 + lfp.v2 : NaN) : decV("V1") + decV("V2"),
  }));

  return <section className="surface p-5 sm:p-6 mt-4">
    <div className="eyebrow mb-1">Over the battery&apos;s life · 15-year simulation</div>
    <h2 className="text-[18px] font-semibold tracking-tight mb-4">Capacity, energy recovered and environmental value</h2>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Deliverable capacity as a share of nameplate over 15 years, with the 70% service threshold">
          {[0.6, 0.7, 0.8, 0.9, 1.0].map((v) => <g key={v}><line x1={L} x2={L + IW} y1={Y(v)} y2={Y(v)} stroke={v === c.eol ? "#c0392b" : "#e3e9e5"} strokeDasharray={v === c.eol ? "5 3" : undefined} />
            <text x={L - 5} y={Y(v) + 4} fontSize="10" textAnchor="end" fill="#687b70">{Math.round(v * 100)}%</text></g>)}
          <text x={L + 4} y={Y(c.eol) + 12} fontSize="10" fill="#c0392b">{Math.round(c.eol * 100)}% service threshold: cells topped up below it</text>
          {conds.map((cd) => { const bs = r.bands.filter((b) => b.cond === cd).sort((a, b) => a.sim_year - b.sim_year);
            return <g key={cd}>
              <polygon points={[...bs.map((b) => `${X(b.sim_year)},${Y(ret(b, "p95"))}`), ...bs.slice().reverse().map((b) => `${X(b.sim_year)},${Y(ret(b, "p5"))}`)].join(" ")} fill={COL[cd]} opacity="0.12" />
              <polyline points={bs.map((b) => `${X(b.sim_year)},${Y(ret(b, "p50"))}`).join(" ")} fill="none" stroke={COL[cd]} strokeWidth={cd === "A" ? 2.5 : 2} strokeDasharray={cd === "C" ? "4 3" : undefined} />
            </g>; })}
          {years.filter((y) => y % 2 === 0).map((y) => <text key={y} x={X(y)} y={H - 6} fontSize="10" textAnchor="middle" fill="#687b70">{c.start + y}</text>)}
        </svg>
        <div className="flex flex-wrap gap-4 text-[11px] text-muted">{conds.map((cd) => <span key={cd} style={{ color: COL[cd] }}>● {NAME[cd]}</span>)}<span>line = median, band = 5–95% of runs</span></div>
        <p className="text-[11.5px] text-faint mt-1">Deliverable energy at a reference test (December, 25 °C) as a share of {k(c.e_nom / 1000, 1)} MWh nameplate. A fixed string is limited by its weakest cell; bypass lets the rest keep working.</p>
      </div>
      <div className="grid gap-2 content-start text-[12.5px]">
        {[["Lowest capacity over 15 years", `${k(lowest("B") * 100, 1)}% vs ${k(lowest("A") * 100, 1)}%`, `REON EBS vs conventional, median run, share of nameplate; ${Math.round(c.eol * 100)}% triggers top-ups`],
          ["Energy recovered", `+${k(dB - dA)} kWh`, `average deliverable energy B vs A (${k((dB / dA - 1) * 100, 1)}% more)`],
          ["Top-up cells avoided", `${k(avoidedKwh)} kWh`, `over 15 years (A adds ${k(augA)} kWh, B adds ${k(augB)} kWh)`],
          ["Top-up cost avoided", `$${k(avoidedKwh * c.augCost / 1000, 1)}K`, `at an assumed $${c.augCost}/kWh installed`],
          ["Manufacturing CO₂ avoided", `${k(avoidedKwh * c.co2[1] / 1000, 1)} t`, `CO₂e for cells not made (range ${k(avoidedKwh * c.co2[0] / 1000, 1)}–${k(avoidedKwh * c.co2[2] / 1000, 1)} t at ${c.co2[0]}–${c.co2[2]} kg/kWh, literature)`]]
          .map(([a, b, d]) => <div key={a} className="rounded-lg border border-line p-3"><div className="text-faint text-[11.5px]">{a}</div><div className="num text-[19px] font-semibold">{b}</div><div className="text-[11px] text-faint">{d}</div></div>)}
        <p className="text-[11px] text-faint">Model outputs, base case (2-h, healthy cooling). No grid-CO₂ saving is claimed.</p>
      </div>
    </div>

    <div className="mt-6">
      <div className="eyebrow mb-2">Chemistry: sodium-ion vs lithium-ion (LFP)</div>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px] min-w-[620px]">
        <thead><tr className="text-left text-faint"><th className="py-1 pr-3"></th>{chemRows.map((ch) => <th key={ch.name} className="py-1 pr-3">{ch.name === "LFP" ? "Lithium-ion (LFP)" : "Sodium-ion (Na-ion)"}</th>)}</tr></thead>
        <tbody>
          {([["Installed price (assumed range)", (ch: typeof chemRows[number]) => `$${k(ch.price.low)}–${k(ch.price.high)}/kWh (central $${k(ch.price.central)})`],
            ["Cell-level value (B/C vs A, per year)", (ch: typeof chemRows[number]) => `${ch.cellValue >= 0 ? "+" : "−"}$${k(Math.abs(ch.cellValue) / 1000, 1)}K`],
            ["15-yr NPV at central price, conventional", (ch: typeof chemRows[number]) => `$${k(ch.npv_full.A / 1e6, 2)}M`],
            ["15-yr NPV at central price, REON EBS + PeakSure", (ch: typeof chemRows[number]) => `$${k(ch.npv_full.C / 1e6, 2)}M`],
            ["Lowest charge before a 240-cell string hits a 750 V DC floor", (ch: typeof chemRows[number]) => `${k(ch.floor_min_soc * 100)}%`]] as [string, (ch: typeof chemRows[number]) => string][])
            .map(([label, f]) => <tr key={label} className="border-t border-line"><td className="py-2 pr-3 text-ink">{label}</td>{chemRows.map((ch) => <td key={ch.name} className="py-2 pr-3 num text-muted">{f(ch)}</td>)}</tr>)}
        </tbody></table></div>
      <p className="text-[11.5px] text-faint mt-2">LFP is cheaper and its flat voltage curve keeps the string above the DC floor until nearly empty; sodium-ion&apos;s sloped curve hits it at about half charge. LFP is modelled with generic LFP cell data as a sensitivity: REON has not published EBS Li+ capacity, power or exact chemistry. Prices are team and market assumptions, not REON quotes.</p>
    </div>
  </section>;
}
