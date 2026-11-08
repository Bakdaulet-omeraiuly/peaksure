"use client";
// Proposal: the two-stage plan. Numbers are read from the generated results, never typed in.
import Link from "next/link";
import { useEffect, useState } from "react";
import AppBar from "@/components/AppBar";
import { fetchJson } from "@/engine/data";

type Sens = { tag: string; v1: number; v2: number };
type Dec = { component: string; mean: number };
type Strategy = { assumptions: { premium: { low: number; central: number; high: number }; retrofit_cost: { low: number; high: number }; discount_rate: number } };
const usd = (x: number) => `${x < 0 ? "−" : ""}$${(Math.abs(x) / 1000).toFixed(Math.abs(x) < 10000 ? 1 : 0)}K`;

const CASES: [string, string][] = [
  ["base", "2-h battery, healthy cells"], ["duration_1h", "1-h battery"], ["duration_4h", "4-h battery"],
  ["hvac_weak", "Weak cooling"], ["hvac_failing", "Failing cooling"], ["fault_scenario", "Cell faults"],
  ["chem_LFP", "2-h battery with LFP cells"],
];

function Stage({ n, title, tag, children }: { n: string; title: string; tag: string; children: React.ReactNode }) {
  return <section className="surface p-6">
    <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-full bg-[#153b2f] text-white grid place-items-center text-[13px] font-semibold">{n}</span>
      <span className="eyebrow">{tag}</span></div>
    <h2 className="text-[19px] font-semibold tracking-tight mb-3">{title}</h2>
    <div className="text-[13.5px] leading-relaxed text-muted space-y-2">{children}</div>
  </section>;
}

export default function Proposal() {
  const [r, setR] = useState<{ sens: Sens[]; dec: Dec[] } | null>(null);
  const [s, setS] = useState<Strategy | null>(null);
  useEffect(() => {
    fetchJson<{ sens: Sens[]; dec: Dec[] }>("/data/results.json").then(setR);
    fetchJson<Strategy>("/data/strategy.json").then(setS);
  }, []);
  const value = (tag: string) => {
    if (!r) return null;
    if (tag === "base") {
      const g = (c: string) => r.dec.find((d) => d.component.startsWith(c))?.mean ?? 0;
      return g("V1") + g("V2");
    }
    const x = r.sens.find((d) => d.tag === tag);
    return x ? x.v1 + x.v2 : null;
  };
  const a = s?.assumptions;
  return <div className="site-shell"><AppBar />
    <main className="page-wrap max-w-[1040px]">
      <div className="eyebrow mb-3">PeakSure × REON EBS</div>
      <h1 className="page-title mb-3">Prove cell-level control on existing batteries, then sell it built in.</h1>
      <p className="text-[14.5px] text-muted leading-relaxed max-w-[760px] mb-6">PeakSure tells a battery operator how much power to commit before each peak, using REON&apos;s cell-level data. The goal is peak shaving: lower demand and capacity charges for Massachusetts utilities and commercial sites.</p>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <Stage n="1" tag="Retrofit · prove it" title="Add REON's cell-level BMS to batteries already installed">
          <p><b className="text-ink">What we sell:</b> the cell-control technology and PeakSure, without a new battery.</p>
          <p><b className="text-ink">Where:</b> existing batteries with weak cells, poor cooling, or short (1-h) or long (4-h) duration, where cells limit what the battery can deliver.</p>
          <p><b className="text-ink">Cost assumption:</b> {a ? `$${a.retrofit_cost.low}–${a.retrofit_cost.high}/kWh` : "…"} for the retrofit (team estimate).</p>
          <p><b className="text-ink">Exit test:</b> measured extra delivered energy and fewer missed peaks on a real site.</p>
        </Stage>
        <Stage n="2" tag="Scale · sell it" title="Sell new REON EBS batteries with cell control built in">
          <p><b className="text-ink">What we sell:</b> EBS battery systems with the cell-level BMS, and PeakSure as the decision layer.</p>
          <p><b className="text-ink">When:</b> after Stage 1 shows field evidence, and REON confirms EBS specifications and certification.</p>
          <p><b className="text-ink">Price assumption:</b> {a ? `${Math.round(a.premium.low * 100)}% to +${Math.round(a.premium.high * 100)}%` : "…"} versus a conventional battery (team estimate).</p>
          <p><b className="text-ink">Exit test:</b> EBS delivers more over its life than a conventional battery of the same size.</p>
        </Stage>
      </div>

      <section className="surface p-6 mb-4">
        <div className="eyebrow mb-2">Where cell-level control pays (model, per year)</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CASES.map(([tag, label]) => { const v = value(tag); return <div key={tag} className="rounded-lg border border-line p-3">
            <div className="text-[12px] text-muted">{label}</div>
            <div className="num text-[20px] font-semibold" style={{ color: v === null ? undefined : v > 1000 ? "var(--ok)" : "var(--text-muted, #667)" }}>{v === null ? "…" : `${v >= 0 ? "+" : ""}${usd(v)}`}</div>
          </div>; })}
        </div>
        <p className="text-[12px] text-faint mt-3">Extra peak savings from cell bypass plus the cell twin, 2.5 MW plant, 15-year simulation. Near zero for a healthy 2-h battery; large when cells or cooling limit delivery. Simulation, not hardware results.</p>
      </section>

      <section className="rounded-xl p-6 sm:p-7 mb-4 bg-[#153b2f] text-white">
        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#9cdbc0] mb-2">Our recommendation</div>
        <h2 className="text-[21px] font-semibold tracking-tight mb-3">Start now with a retrofit pilot on batteries that are already struggling.</h2>
        <p className="text-[14px] leading-relaxed text-[#d7ebe2] max-w-[820px]">Run REON&apos;s cell-level control and PeakSure on one or two existing Massachusetts batteries where weak cells, cooling or short duration limit what they deliver. That is where the model shows the value; on a healthy 2-hour battery it shows almost none, so we do not lead there.</p>
        <ol className="grid sm:grid-cols-3 gap-3 mt-5">
          {[["Next 3 months", "Read-only data pilot", "PeakSure reads cell and meter data and recommends each peak commitment. People decide; nothing is controlled."],
            ["3 to 12 months", "Retrofit pilot", "Add REON's cell-level BMS. Measure delivered energy, missed peaks and savings against the same battery's history."],
            ["After the evidence", "Scale with EBS", "Sell new REON EBS systems with cell control and PeakSure built in, priced on measured, not modelled, value."]]
            .map(([when, what, how]) => <li key={when} className="rounded-lg bg-white/10 p-4"><div className="text-[11px] uppercase tracking-wide text-[#9cdbc0]">{when}</div>
              <div className="font-semibold text-[15px] mt-1">{what}</div><p className="text-[12.5px] text-[#d7ebe2] mt-1 leading-relaxed">{how}</p></li>)}
        </ol>
        <div className="grid sm:grid-cols-3 gap-4 mt-6 text-[13px] leading-relaxed text-[#d7ebe2]">
          <p><b className="text-white">Scaling.</b> Every pilot adds real cell data. That calibrates the twin and turns modelled savings into measured ones, which is the evidence REON needs to sell EBS at scale.</p>
          <p><b className="text-white">Reliability.</b> Commitments are made with 95% confidence and weak cells are switched out instead of stopping a string, so the battery shows up when the peak arrives.</p>
          <p><b className="text-white">Affordable power.</b> Municipal utilities pass peak charges to every household. Getting more out of batteries they already own lowers those charges without buying new hardware first.</p>
        </div>
        <p className="text-[11.5px] text-[#9cdbc0] mt-5">Values above are simulation results. The pilot&apos;s job is to confirm or correct them on real hardware.</p>
      </section>

      <div className="flex flex-wrap gap-2"><Link href="/compare" className="btn btn-accent">See the comparison</Link><Link href="/assumptions" className="btn">Assumptions</Link><Link href="/method" className="btn">Method</Link></div>
    </main></div>;
}
