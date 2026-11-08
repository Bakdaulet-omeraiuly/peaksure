import AppBar from "@/components/AppBar";
import Link from "next/link";
import strategy from "../../../public/data/strategy.json";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n / 1000).toFixed(0)}k`;
const kwh = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(1)}/kWh`;
const a = strategy.assumptions;

function VoltageCurve({ rows }: { rows: typeof strategy.chemistries }) {
  const W = 480, H = 175, left = 38, top = 14, iw = W - left - 16, ih = H - top - 28;
  const x = (soc: number) => left + soc * iw;
  const y = (v: number) => top + (3.9 - v) / (3.9 - 1.4) * ih;
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[600px]" role="img" aria-label="Illustrative sodium-ion and LFP discharge voltage curves">
    {[0, 0.25, 0.5, 0.75, 1].map((v) => <g key={v}><line x1={x(v)} x2={x(v)} y1={top} y2={top + ih} stroke="#dce4df" /><text x={x(v)} y={H - 4} textAnchor="middle" fill="#687b70" fontSize="11">{Math.round(v * 100)}%</text></g>)}
    {[1.5, 2.5, 3.5].map((v) => <g key={v}><line x1={left} x2={W - 16} y1={y(v)} y2={y(v)} stroke="#dce4df" /><text x={left - 5} y={y(v) + 4} textAnchor="end" fill="#687b70" fontSize="11">{v} V</text></g>)}
    {rows.map((r, i) => <polyline key={r.name} points={r.curve.map((p) => `${x(p.soc)},${y(p.v)}`).join(" ")} fill="none" stroke={i ? "#3479a2" : "#c8772b"} strokeWidth="3" />)}
  </svg>;
}

export default function Strategy() {
  const blocks = Math.ceil(a.nominal_mw * 1000 / a.ebs_block_kw);
  return <div className="site-shell"><AppBar /><main className="page-wrap max-w-[1120px]">
    <div className="eyebrow mb-3">Product & economics</div>
    <h1 className="page-title mb-3">What the battery model represents.</h1>
    <p className="text-[14px] leading-relaxed text-muted max-w-[830px] mb-3">REON says its CESS containers and OES cabinets are white-label products. EBS is the product with REON&apos;s cell-level control. PeakSure compares a conventional battery with an EBS-equivalent plant at the same modeled power and energy.</p>
    <p className="text-[12px] text-muted mb-6">Explore the separate <Link href="/ebs" className="underline text-[var(--accent)]">EBS block simulation</Link> to test cell count, voltage-floor and weak-cell assumptions at the published block rating.</p>

    <div className="grid md:grid-cols-3 gap-3 mb-6">
      <div className="surface p-5"><div className="micro mb-2">Conventional</div><p className="text-[13px] text-muted">Fixed strings and a conventional BMS. This is comparison A, including a white-label CESS-like plant.</p></div>
      <div className="surface p-5"><div className="micro mb-2">EBS equivalent</div><p className="text-[13px] text-muted">Na+ EBS is {a.ebs_block_kw} kW / {a.ebs_block_kwh} kWh per block. About {blocks} blocks match a {a.nominal_mw} MW / {a.nominal_mwh} MWh plant by nameplate size.</p></div>
      <div className="surface p-5"><div className="micro mb-2">Schematic wiring</div><p className="text-[13px] text-muted">The main Explore view models {a.active_cells} cells per string; the separate EBS study tests an assumed 120-cell block. EBS topology and DC/DC stages are unconfirmed. The 3D racks are a comparison diagram, not an EBS drawing.</p></div>
    </div>

    <section className="surface p-5 sm:p-7 mb-5"><div className="eyebrow mb-2">Two-stage proposal</div><div className="grid md:grid-cols-2 gap-6 text-[13px] text-muted leading-relaxed">
      <div><h2 className="text-ink font-semibold text-[16px] mb-1">1. Retrofit an existing battery</h2><p>Add cell-level control to a municipal battery only if REON confirms compatibility, certification and warranty terms. The team sheet assumes {money(strategy.team.s2.retrofit_capex)} for a {a.nominal_mwh} MWh retrofit. This price is not a quote.</p></div>
      <div><h2 className="text-ink font-semibold text-[16px] mb-1">2. Build new EBS plants</h2><p>After field validation, compare a new EBS-based plant against a new conventional battery. The team sheet assumes a {(a.premium.central * 100).toFixed(0)}% EBS price premium; REON has not provided a price.</p></div>
    </div></section>

    <div className="grid lg:grid-cols-2 gap-4 mb-5">
      <section className="surface p-5 sm:p-7"><div className="eyebrow mb-2">Team sheet · assumptions</div><h2 className="text-[18px] font-semibold mb-3">What the proposal assumes</h2>
        <div className="text-[13px] text-muted space-y-2"><p>New plant: conventional NPV {money(strategy.team.s1.conv_npv)}; REON NPV {money(strategy.team.s1.reon_npv)}. Difference <b className="text-ink">{money(strategy.team.s1.incr_npv)}</b> over {a.life_years} years.</p>
          <p>Retrofit: assumed extra gross savings {money(strategy.team.s2.retrofit_gross)}/year; NPV {money(strategy.team.s2.retrofit_npv)} over {strategy.chemistries[0].retrofit.remaining_years} years.</p>
          <p className="text-[11px] text-faint">The team sheet assumes extra savings. These values are scenario inputs, not measured or simulated battery performance.</p></div>
      </section>
      <section className="surface p-5 sm:p-7"><div className="eyebrow mb-2">Paired simulation · model results</div><h2 className="text-[18px] font-semibold mb-3">What the model computes</h2>
        <div className="space-y-3 text-[13px] text-muted">{strategy.chemistries.map((r) => <div key={r.name} className="border-b border-line pb-3 last:border-0"><b className="text-ink">{r.name}</b> · {r.runs} paired runs<br />New conventional NPV {money(r.npv_full.A)}; EBS + PeakSure NPV {money(r.npv_full.C)} at the assumed central prices.<br />Retrofit break-even at year {r.retrofit.age}: <b className="text-ink">{kwh(r.retrofit.breakeven_kwh)}</b> (95% interval {kwh(r.retrofit.lo)} to {kwh(r.retrofit.hi)}).</div>)}
          <p className="text-[11px] text-faint">A negative retrofit break-even means this simulated peak duty does not support even a zero-cost retrofit after extra O&M. The retrofit model assumes EBS control from year 0 and may overstate later retrofits.</p></div>
      </section>
    </div>

    <section className="surface p-5 sm:p-7 mb-5"><div className="eyebrow mb-2">Chemistry & DC window</div><h2 className="text-[18px] font-semibold mb-2">Na-ion and LFP behave differently.</h2>
      <p className="text-[13px] text-muted max-w-[800px]">Representative terminal-voltage shapes at 0.5C discharge. The assumed {a.dc_floor_v} V DC floor and {a.active_cells}-cell string imply a minimum charge of {strategy.chemistries.map((r) => `${r.name} ${(r.floor_min_soc * 100).toFixed(1)}%`).join("; ")}. This voltage cutoff is <b>not yet applied</b> in the battery simulator.</p>
      <VoltageCurve rows={strategy.chemistries} />
      <div className="flex flex-wrap gap-4 text-[11px] text-muted"><span className="text-[#c8772b]">● Na-ion</span><span className="text-[#3479a2]">● LFP</span></div>
    </section>

    <section className="surface p-5 sm:p-7"><div className="eyebrow mb-2">Installed cost assumptions</div><div className="grid md:grid-cols-2 gap-5 text-[13px] text-muted">{strategy.chemistries.map((r) => <div key={r.name}><h2 className="font-semibold text-ink mb-1">{r.name}</h2><p>Low {kwh(r.price.low)} · central {kwh(r.price.central)} · high {kwh(r.price.high)}</p><p className="text-[11px] text-faint mt-1">{r.price_note}</p></div>)}</div><p className="text-[11px] text-faint mt-4">Prices mix benchmarks with different scope and team assumptions. No REON quote or verified retrofit compatibility is available. Results are a simulation, not hardware validation.</p></section>
  </main></div>;
}
