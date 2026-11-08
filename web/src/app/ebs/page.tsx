"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import AppBar from "@/components/AppBar";
import data from "../../../public/data/ebs.json";

const EBSPair3D = dynamic(() => import("@/components/EBSPair3D"), { ssr: false });
import EBSScenario from "@/components/EBSScenario";
import PilotWorkflow from "@/components/PilotWorkflow";

const fmt = (v: number, digits = 0) => v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const W = 600, H = 190, L = 42, T = 12, IW = W - L - 18, IH = H - T - 30;
const X = (minute: number) => L + minute / 240 * IW;
const Y = (power: number) => T + IH * (1 - power / (data.assumptions.blocks * data.assumptions.block_kw));

export default function EBS() {
  const [weak, setWeak] = useState(1);
  const [floor, setFloor] = useState(300);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const row = data.rows.find((r) => r.weak_factor === weak && r.dc_floor_v === floor)!;
  const tick = row.fixed.power_trace.find((p) => p.minute === minute)!;
  const tickB = row.bypass.power_trace.find((p) => p.minute === minute)!;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setMinute((m) => {
      if (m >= 240) { setPlaying(false); return 240; }
      return m + 5;
    }), 150);
    return () => window.clearInterval(timer);
  }, [playing]);
  const replay = () => { setMinute(0); setPlaying(true); };

  return <div className="site-shell"><AppBar /><main className="page-wrap max-w-[1120px]">
    <div className="eyebrow mb-3">EBS · block simulation</div>
    <h1 className="page-title mb-3">EBS: conventional vs REON-style cell bypass</h1>
    <p className="text-[13px] text-muted leading-relaxed max-w-[850px] mb-4">REON&apos;s hardware page lists the EBS line at <b>30 kW / 60 kWh</b> with Na+ (sodium-ion) and Li+ (lithium) variants. It does not say which variant that rating describes, whether it is rated or usable energy, or on which side of the inverter it is measured. Na+ claims (20,000 cycles; −40 to +140 °F) come without test conditions. Li+ is only described as &ldquo;more than twice the energy in the same form factor&rdquo;, so it is not simulated. Cell count, N_min, DC floor, switch resistance and efficiency below are model assumptions. This is a simulation, not REON hardware validation.</p>
    <PilotWorkflow />
    <EBSScenario />
    <div className="eyebrow mb-3 mt-6">Fleet sensitivity · 84 blocks · drain at rated power</div>
    <p className="text-[14px] text-muted leading-relaxed max-w-[850px] mb-5">A separate exploratory model of {data.assumptions.blocks} independent Na+ EBS-size blocks, rated {fmt(data.assumptions.blocks * data.assumptions.block_kw / 1000, 2)} MW / {fmt(data.assumptions.blocks * 60 / 1000, 2)} MWh together. Both cases discharge the <b>same generated cells</b> at {data.assumptions.block_kw} kW per block: a fixed string stops at its first empty cell; bypass switches that cell out while voltage and the minimum active-cell count allow it.</p>

    <div className="surface p-5 mb-4"><div className="flex flex-wrap gap-5 items-end">
      <label className="text-[12px] text-muted"><span className="block font-semibold text-ink mb-1">One cell per block retains</span><select className="border border-line rounded-md p-2 bg-white" value={weak} onChange={(e) => { setWeak(+e.target.value); setMinute(0); setPlaying(false); }}><option value={1}>100% · natural spread only</option><option value={0.9}>90% · stress case</option><option value={0.8}>80% · stress case</option></select></label>
      <label className="text-[12px] text-muted"><span className="block font-semibold text-ink mb-1">Minimum block DC voltage</span><select className="border border-line rounded-md p-2 bg-white" value={floor} onChange={(e) => { setFloor(+e.target.value); setMinute(0); setPlaying(false); }}>{[280, 300, 330, 350, 750].map((v) => <option key={v} value={v}>{v} V{v === 750 ? " · direct input test" : " · assumed DC/DC"}</option>)}</select></label>
      <button className="btn btn-accent" onClick={replay}>Replay discharge</button>
    </div><p className="text-[11px] text-faint mt-3">These are sensitivity inputs, not published EBS cell count or converter specifications. The 750 V option tests what happens if a 120-cell block is connected directly to that inverter floor.</p></div>

    <section className="mb-4"><EBSPair3D a={{ frame: tick, bypass: false, title: "A · Conventional battery", sub: "fixed series string", status: minute === 0 ? "start" : tick.block_online ? "running" : "STOPPED" }} b={{ frame: tickB, bypass: true, title: "B · REON-style EBS model", sub: "cell bypass (schematic)", status: minute === 0 ? "start" : tickB.block_online ? "running" : "STOPPED" }} started={minute > 0} diagnosisCell={null} difference={false} /><p className="text-[11px] text-faint mt-2">Block 1 of {data.assumptions.blocks} from each case, using the simulation&apos;s cell charge and switch states at t+{minute} min. The charts and totals below cover all {data.assumptions.blocks} blocks.</p></section>

    <section className="surface p-4 mb-4 text-[12px] leading-relaxed text-muted" aria-live="polite"><span className="micro block mb-1">What this setting demonstrates</span>
      {row.fixed.energy_kwh === 0 && row.bypass.energy_kwh === 0
        ? <>Neither modeled block can start at this DC voltage floor. A compatible converter or a different series layout would need validation before claiming output.</>
        : row.extra_kwh > 0
          ? <>The REON-style bypass model delivers <b>{fmt(row.extra_kwh)} kWh more</b> than the conventional string across {data.assumptions.blocks} blocks, with <b>{fmt(row.extra_full_power_min, 1)} more minutes</b> at full plant power. This is the modeled benefit of continuing past weak cells under these assumptions.</>
          : <>Cell bypass brings no net energy gain at this setting ({fmt(row.extra_kwh)} kWh difference). The DC floor and switch-path loss limit what it can recover. Lower converter floor and switch resistance are engineering targets to test, not confirmed EBS specifications.</>}
    </section>

    <div className="grid sm:grid-cols-4 gap-3 mb-4">
      <div className="surface p-4"><div className="micro mb-1">Conventional BMS · EBS-sized cells</div><div className="text-[23px] font-semibold num">{fmt(row.fixed.energy_kwh)} kWh</div><div className="text-[11px] text-faint">fixed string · energy to shutdown</div></div>
      <div className="surface p-4"><div className="micro mb-1">REON-style EBS · bypass model</div><div className="text-[23px] font-semibold num">{fmt(row.bypass.energy_kwh)} kWh</div><div className="text-[11px] text-faint">cell bypass · energy to shutdown</div></div>
      <div className="surface p-4"><div className="micro mb-1">Bypass difference</div><div className="text-[23px] font-semibold num" style={{ color: row.extra_kwh >= 0 ? "var(--ok)" : "var(--error)" }}>{row.extra_kwh >= 0 ? "+" : ""}{fmt(row.extra_kwh)} kWh</div><div className="text-[11px] text-faint">includes assumed switch resistance</div></div>
      <div className="surface p-4"><div className="micro mb-1">Extra full-power time</div><div className="text-[23px] font-semibold num" style={{ color: row.extra_full_power_min >= 0 ? "var(--ok)" : "var(--error)" }}>{row.extra_full_power_min >= 0 ? "+" : ""}{fmt(row.extra_full_power_min, 1)} min</div><div className="text-[11px] text-faint">all {data.assumptions.blocks} blocks online</div></div>
    </div>

    <section className="surface p-5 sm:p-7 mb-4"><div className="eyebrow mb-2">Same discharge, synchronized</div><h2 className="text-[18px] font-semibold mb-3">Available power over time</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[850px]" role="img" aria-label="Conventional and REON-style EBS modeled power during the same discharge">
        {[0, 60, 120, 180, 240].map((m) => <g key={m}><line x1={X(m)} x2={X(m)} y1={T} y2={T + IH} stroke="#dce4df" /><text x={X(m)} y={H - 5} textAnchor="middle" fill="#687b70" fontSize="11">{m} min</text></g>)}
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={L + IW} y1={Y(f * data.assumptions.blocks * data.assumptions.block_kw)} y2={Y(f * data.assumptions.blocks * data.assumptions.block_kw)} stroke="#dce4df" /><text x={L - 6} y={Y(f * data.assumptions.blocks * data.assumptions.block_kw) + 4} textAnchor="end" fill="#687b70" fontSize="11">{fmt(f * data.assumptions.blocks * data.assumptions.block_kw / 1000, 1)}</text></g>)}
        <polyline points={row.fixed.power_trace.map((p) => `${X(p.minute)},${Y(p.power_kw)}`).join(" ")} fill="none" stroke="#687a83" strokeWidth="2.5" />
        <polyline points={row.bypass.power_trace.map((p) => `${X(p.minute)},${Y(p.power_kw)}`).join(" ")} fill="none" stroke="#137454" strokeWidth="3" />
        <line x1={X(minute)} x2={X(minute)} y1={T} y2={T + IH} stroke="#3479a2" strokeWidth="1.5" />
      </svg>
      <div className="flex flex-wrap gap-4 text-[11px] text-muted mb-3"><span className="text-[#687a83]">● Conventional BMS · fixed string</span><span className="text-[#137454]">● REON-style EBS · bypass model</span><span>Power axis: MW</span></div>
      <input className="w-full" type="range" min={0} max={240} step={5} value={minute} onChange={(e) => { setMinute(+e.target.value); setPlaying(false); }} aria-label="Discharge time in minutes" />
      <p className="text-[12px] text-muted mt-2 num">t+{minute} min · Conventional BMS {fmt(tick.power_kw)} kW · REON-style EBS {fmt(tickB.power_kw)} kW · {tickB.bypassed_cells} cells bypassed</p>
    </section>

    <div className="grid md:grid-cols-2 gap-4 mb-4"><section className="surface p-5"><div className="eyebrow mb-2">Electrical assumptions</div><ul className="text-[12px] text-muted leading-relaxed space-y-1 list-disc pl-5"><li>{data.assumptions.cells_per_block} series cells per block, about {fmt(data.assumptions.cell_ah)} Ah each</li><li>{data.assumptions.n_min} cells minimum after bypass</li><li>{fmt(data.assumptions.r_on_ohm * 1000, 2)} mΩ switch resistance per active cell</li><li>{fmt(data.assumptions.eta * 100)}% DC-to-AC efficiency</li><li>One weak cell per block is a stress scenario, not a measured failure rate</li></ul></section>
      <section className="surface p-5"><div className="eyebrow mb-2">Economic hurdle</div><p className="text-[12px] text-muted leading-relaxed">The team financial model assumes an EBS plant costs {fmt(data.economics.assumed_ebs_price_premium * 100)}% more than a conventional plant. With its other inputs, EBS would need roughly <b>${fmt(data.economics.required_extra_gross_savings_per_year_usd)}/year</b> in additional gross savings to cover that premium and O&amp;M difference. The discharge above does <b>not</b> establish annual peak savings or an EBS price quote.</p></section></div>
    <section className="surface p-5 sm:p-7 mb-4"><div className="eyebrow mb-2">Team workbook · Paxton-sized example</div><h2 className="text-[18px] font-semibold mb-2">A larger EBS project needs energy sizing.</h2>
      <p className="text-[12px] text-muted leading-relaxed">For a {fmt(data.paxton.inputs.power_kw / 1000)} MW, {fmt(data.paxton.inputs.hours)}-hour target, the team workbook sizes <b>{fmt(data.paxton.sheet.units)} EBS units</b> using an assumed {fmt(data.paxton.inputs.usable_fraction * 100)}% usable fraction. That is {fmt(data.paxton.sheet.nominal_kwh / 1000, 2)} MWh nominal and {fmt(data.paxton.sheet.usable_kwh / 1000, 2)} MWh usable. The energy target, not the power target, sets the unit count.</p>
      <p className="text-[12px] text-muted leading-relaxed mt-2">At the workbook&apos;s assumed ${fmt(data.paxton.sheet.price_kwh)}/kWh installed price and ${fmt(data.paxton.inputs.gross_savings_yr)}/year gross savings, its calculated NPV is <b>${fmt(data.paxton.sheet.npv)}</b>. This is a spreadsheet scenario, not measured Paxton cash flow or the block-discharge result above. {data.paxton.compliance_items_unpriced} compliance items are still unpriced; their $0 placeholders mean unknown cost.</p>
    </section>
    <p className="text-[11px] text-faint leading-relaxed max-w-[950px]">This is an exploratory block model, not REON hardware validation. Actual cell count, DC/DC design, converter floor, switch resistance, weak-cell frequency and MW-scale block connection need REON confirmation. See <Link href="/strategy" className="underline">Product &amp; cost</Link> for the separate 15-year plant-level study and price assumptions.</p>
  </main></div>;
}
