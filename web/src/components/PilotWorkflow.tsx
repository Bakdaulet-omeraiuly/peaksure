"use client";
// Advisory demand-target planner for one EBS-size block at a C&I site (National Grid MA G-2).
// Operator flow: profile → data → quality checks → peak day → recommendation (belief only) → why → simulated plant
// check (after the event) → difference and sensitivity → export. Not connected to any battery; human review required.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/engine/data";
import { CONTRACT, G2, ContinuityPlan, Point, continuitySchedule, peakDay, plantCheck, recommend, validate } from "@/engine/facility";
import { EbsScenarioFile } from "@/engine/ebsScenario";

const SiteScene3D = dynamic(() => import("@/components/SiteScene3D"), { ssr: false });
type Curve = { kw: number[]; p5: number[]; p50: number[]; p95: number[] };
type Plant = { kw: number[]; kwh: number[] };
type Curves = { weak_factor: number; belief: Record<"fixed" | "bypass", Curve>; plant: Record<"fixed" | "bypass", Plant> }[];
const f = (v: number, d = 1) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const he = (h: number) => `HE${h} (${String(h - 1).padStart(2, "0")}:00–${String(h % 24).padStart(2, "0")}:00)`;
const HW = { fixed: "A · Conventional (fixed string)", bypass: "B · REON-style bypass" } as const;

async function sha256(text: string) {
  try { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join(""); }
  catch { return "unavailable"; }
}

export default function PilotWorkflow() {
  const [E, setE] = useState<(EbsScenarioFile & { energy_curves: Curves }) | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [source, setSource] = useState<"sample" | "upload">("sample");
  const [fileName, setFileName] = useState("sample_facility_load_SYNTHETIC.csv");
  const [weak, setWeak] = useState(1);
  const [reveal, setReveal] = useState(false);
  const [hour, setHour] = useState(15);
  const [hw, setHw] = useState<"fixed" | "bypass">("bypass");
  const [reservePct, setReservePct] = useState(20);
  const [hash, setHash] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useEffect(() => { fetchJson<EbsScenarioFile & { energy_curves: Curves }>("/data/ebs_scenario.json").then(setE).catch(() => setLoadErr("Could not load the EBS scenario export.")); }, []);
  useEffect(() => {
    if (source !== "sample") return;
    fetch("/data/sample_facility_load_SYNTHETIC.csv").then((r) => r.text()).then((t) => { setText(t); setFileName("sample_facility_load_SYNTHETIC.csv"); })
      .catch(() => setLoadErr("Could not load the sample dataset."));
  }, [source]);
  useEffect(() => { if (text) sha256(text).then(setHash); setReveal(false); }, [text]);
  const v = useMemo(() => (text ? validate(text, source === "upload" ? new Date() : undefined) : null), [text, source]);
  const day: Point[] | null = useMemo(() => (v?.series ? peakDay(v.series) : null), [v]);
  const dtH = (v?.report.intervalMin ?? 60) / 60;
  const curves = E?.energy_curves.find((c) => c.weak_factor === weak);
  const res = useMemo(() => {
    if (!E || !curves || !day) return null;
    const load = day.map((p) => p.kw);
    const out = (["fixed", "bypass"] as const).map((k) => {
      const b = curves.belief[k];
      const rec = recommend(load, dtH, E.rated_kw, b.kw, b.p5, reservePct / 100);
      const p50 = recommend(load, dtH, E.rated_kw, b.kw, b.p50, reservePct / 100).target;
      return { k, rec, p50, check: plantCheck(rec.target, curves.plant[k].kw, curves.plant[k].kwh) };
    });
    return { load, out };
  }, [E, curves, day, dtH, reservePct]);

  const selected = res?.out.find((o) => o.k === hw);
  const continuity = useMemo(() => {
    if (!E || !res || !selected) return null;
    return continuitySchedule(res.load, selected.rec.target.dischargeKw, dtH, selected.rec.energyLimitKwh,
      selected.rec.reserveKwh, selected.rec.target.targetKw, E.rated_kw, 0.96);
  }, [E, res, selected, dtH]);

  if (loadErr) return <div className="surface p-5 mb-4 text-[12px] text-error">{loadErr}</div>;
  if (!E || !v) return <div className="surface p-5 mb-4 text-[12px] text-muted">Loading planner…</div>;
  const synthetic = source === "sample";
  const pick = selected;
  const perHour = Math.round(1 / dtH);
  const idx = Math.min((hour - 1) * perHour, (res?.load.length ?? 1) - 1);
  const loadNow = res ? res.load[idx] : 0;
  const battNow = continuity ? continuity.dischargeKw[idx] - continuity.chargeKw[idx] : 0;
  const A = res?.out[0], B = res?.out[1];
  const dReduction = A && B ? B.rec.target.reductionKw - A.rec.target.reductionKw : 0;
  const why = (o: NonNullable<typeof A>) => {
    const t = o.rec.target;
    return `The twin's 5th-percentile deliverable AC energy at ${E.rated_kw} kW is ${f(o.rec.energyLimitKwh)} kWh. PeakSure keeps ${f(o.rec.reserveKwh)} kWh (${reservePct}%) in reserve, leaving ${f(o.rec.dispatchEnergyKwh)} kWh for peak shaving. On the peak day (${day ? day[0].t.toDateString() : ""}) the facility peaks at ${f(t.peakKw)} kW. `
      + `Holding demand at ${f(t.targetKw)} kW needs ${f(t.energyKwh)} kWh over ${f(t.hours, 0)} h (${t.firstHe ? he(t.firstHe) : "—"} to ${t.lastHe ? he(t.lastHe) : "—"}), with at most ${f(t.maxDischargeKw)} kW from the battery. `
      + (t.binding === "energy" ? "Energy is the binding limit: a lower target would need more energy than the belief allows at 95% confidence. " : t.binding === "power" ? `Rated power (${E.rated_kw} kW) is the binding limit. ` : "No discharge is recommended. ")
      + `At the median belief the target would be ${f(o.p50.targetKw)} kW; the gap is the price of 95% confidence.`;
  };
  const report = () => ({
    contract: CONTRACT, generated: new Date().toISOString(), advisory: "Advisory only. Not connected to any battery, inverter, BMS or EMS. Human review required.",
    input: { source: synthetic ? "SYNTHETIC sample (NREL/OpenEI simulated retail building, Boston TMY3, July)" : "uploaded file", file: fileName, sha256: hash, quality: v.report },
    product: { profile: "EBS Na+ (simulated)", rated_kw: E.rated_kw, rated_kwh: E.rated_kwh, evidence: E.flags },
    tariff: { name: "National Grid MA G-2", usd_per_kw_month: G2.usdPerKwMonth, status: G2.status, source: G2.source },
    battery_state: { weak_cell_case: weak, reserve_percent: reservePct, cells: E.cells, n_min: E.n_min, dc_floor_v: E.dc_floor_v, r_on_ohm: E.r_on_ohm, eta: E.eta, note: "simulated cells; model assumptions" },
    peak_day: day ? { date: day[0].t.toISOString(), load_kw: day.map((p) => p.kw) } : null,
    recommendations: res?.out.map((o) => ({ hardware: HW[o.k], belief_p5_energy_kwh: o.rec.energyLimitKwh, ...o.rec.target,
      monthly_value_usd: o.rec.target.reductionKw * G2.usdPerKwMonth, simulated_plant_check: reveal ? o.check : "not revealed" })),
    limitations: ["grid-connected continuity only; outage/islanding is not modelled", "20% reserve and off-peak recharge window are adjustable assumptions",
      "hourly data underestimates the 15-minute billed peak", "peak day assumed known", "EBS internals assumed",
      "energy curve uses a fixed 0.5C overpotential", "single month; no ageing", "not hardware validation"],
  });
  const download = (name: string, body: string, type: string) => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const md = () => {
    const r = report();
    return [`# PeakSure advisory demand-target report`, ``, `> ${r.advisory}`, ``, `- Generated: ${r.generated}`, `- Input: ${r.input.source} (${r.input.file}, sha256 ${hash.slice(0, 16)}…)`,
      `- Tariff: ${r.tariff.name}, $${r.tariff.usd_per_kw_month}/kW-month (${r.tariff.status})`, `- Product: ${r.product.profile}, ${r.product.rated_kw} kW / ${r.product.rated_kwh} kWh (EBS line heading; boundary unstated)`,
      `- Battery state: weak-cell case ${weak} (simulated)`, ``, `| Hardware | P5 energy kWh | Target kW | Reduction kW | Energy kWh | Window | $/month |`, `|---|---|---|---|---|---|---|`,
      ...(res?.out ?? []).map((o) => `| ${HW[o.k]} | ${f(o.rec.energyLimitKwh)} | ${f(o.rec.target.targetKw)} | ${f(o.rec.target.reductionKw)} | ${f(o.rec.target.energyKwh)} | HE${o.rec.target.firstHe}–${o.rec.target.lastHe} | ${f(o.rec.target.reductionKw * G2.usdPerKwMonth, 0)} |`),
      ``, `Limitations: ${r.limitations.join("; ")}.`].join("\n");
  };

  return <section className="surface p-5 sm:p-7 mb-4">
    <div className="flex flex-wrap items-center gap-2 mb-2"><span className="eyebrow">Advisory planner · EBS · C&amp;I demand charge</span>
      <span className="badge">human review required</span><span className="badge">not connected to any battery</span></div>
    <h2 className="text-[18px] font-semibold mb-1">What demand target can one EBS block hold on this site&apos;s peak day?</h2>
    <p className="text-[12.5px] text-muted leading-relaxed max-w-[900px] mb-4">For a facility manager or REON applications engineer: load a month of meter data, review its quality, and get a demand target (kW) for the peak day with the energy it needs, the confidence behind it, and the reason. The recommendation uses only the battery twin&apos;s belief. The simulated plant check is shown only after you reveal it.</p>

    <ol className="grid lg:grid-cols-3 gap-3 text-[12px] mb-4">
      <li className="rounded-lg border border-line p-3"><div className="micro mb-1">1 · Product and application</div>
        <div>EBS Na+ <span className="text-faint">(simulated; 30 kW / 60 kWh line heading, boundary unstated)</span></div>
        <div className="text-faint">EBS Li+: not simulated, capacity only claimed by REON</div>
        <div>National Grid MA G-2: <b>${G2.usdPerKwMonth}/kW-month</b> <span className="text-faint">CONFIRMED, eff. 2026-10-01, billed on the greatest 15-min demand</span></div></li>
      <li className="rounded-lg border border-line p-3"><div className="micro mb-1">2 · Data ({CONTRACT})</div>
        <div className="seg inline-flex mb-2"><button data-on={synthetic} onClick={() => setSource("sample")}>Sample</button><button data-on={!synthetic} onClick={() => setSource("upload")}>Upload CSV</button></div>
        {!synthetic && <input type="file" accept=".csv,text/csv" className="block text-[11px]" aria-label="Upload facility load CSV" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setFileName(file.name); setText(await file.text()); } }} />}
        {synthetic && <div><span className="inline-block rounded px-1 text-[9.5px] font-semibold text-white bg-[#8a6d3b] mr-1">SYNTHETIC</span>July, hourly, NREL/OpenEI simulated stand-alone retail building (Boston TMY3). Modelled load, not a REON customer.</div>}
        <div className="text-faint mt-1">Columns: timestamp (ISO local, interval start), kw (average grid import at the meter). 15- or 60-minute intervals.</div></li>
      <li className="rounded-lg border border-line p-3"><div className="micro mb-1">3 · Data quality</div>
        {v.report.ok ? <div style={{ color: "var(--ok)" }}>Passed: {v.report.rows} rows, {v.report.intervalMin}-min, {v.report.start?.slice(0, 10)} to {v.report.end?.slice(0, 10)}</div>
          : <div className="text-error">Rejected: {v.report.errors.join("; ")}</div>}
        {v.report.warnings.map((w) => <div key={w} className="text-[#a8741a]">Warning: {w}</div>)}
        {hash && <div className="text-faint num">sha256 {hash.slice(0, 16)}…</div>}</li>
    </ol>

    {!v.report.ok || !res || !day ? <p className="text-[12px] text-muted">Fix the data errors above to get a recommendation. Nothing is estimated from rejected data.</p> : <>
      <div className="flex flex-wrap gap-4 items-end mb-3 text-[12px] text-muted">
        <div><div className="font-semibold text-ink mb-1">4 · Peak day (sets the monthly bill)</div>{day[0].t.toDateString()} · peak {f(Math.max(...res.load))} kW</div>
        <label><span className="block font-semibold text-ink mb-1">Battery cell state (simulated)</span>
          <select className="border border-line rounded-md p-2 bg-white" value={weak} onChange={(e) => { setWeak(+e.target.value); setReveal(false); }}>
            <option value={1}>natural spread</option><option value={0.9}>stress: one cell at 90%</option><option value={0.8}>stress: one cell at 80%</option></select></label>
        <label><span className="block font-semibold text-ink mb-1">Operating reserve <span className="text-faint">ASSUMED</span></span>
          <select className="border border-line rounded-md p-2 bg-white" value={reservePct} onChange={(e) => { setReservePct(+e.target.value); setReveal(false); }}>
            {[10, 20, 30].map((v) => <option key={v} value={v}>{v}% kept for reliability</option>)}</select></label>
      </div>

      <div className="grid md:grid-cols-2 gap-3 mb-3">
        {res.out.map((o) => { const t = o.rec.target; return <div key={o.k} className="rounded-lg border border-line p-3 text-[12px]">
          <div className="font-semibold">{HW[o.k]}</div>
          <div className="micro mt-1 mb-1">5 · Recommendation (belief only, before the event)</div>
          <div className="num text-[20px] font-semibold">hold ≤ {f(t.targetKw)} kW <span className="text-[12px] font-normal text-muted">(−{f(t.reductionKw)} kW from {f(t.peakKw)})</span></div>
          <div className="num">discharge {t.firstHe ? `${he(t.firstHe)} → ${he(t.lastHe!)}` : "none"} · {f(t.energyKwh)} kWh · peak {f(t.maxDischargeKw)} kW ≤ {E.rated_kw} kW rated</div>
          <div className="num">twin P5 {f(o.rec.energyLimitKwh)} kWh · dispatch budget {f(o.rec.dispatchEnergyKwh)} kWh · reserve {f(o.rec.reserveKwh)} kWh ({reservePct}%) · binding: {t.binding}</div>
          <div className="num">value if held: ${f(t.reductionKw * G2.usdPerKwMonth, 0)}/month at G-2 <span className="text-faint">(MODEL OUTPUT)</span></div>
          <details className="mt-1"><summary className="cursor-pointer text-[var(--accent)]">Why this recommendation?</summary><p className="text-muted mt-1 leading-relaxed">{why(o)}</p></details>
          <div className="micro mt-2 mb-1">6 · Simulated plant check (after the event)</div>
          {reveal ? <div className="num" style={{ color: o.check.delivered ? "var(--ok)" : "var(--error)" }}>{o.check.delivered ? "held" : "would NOT hold"}: simulated plant can deliver {f(o.check.availableKwh)} kWh, needed {f(t.energyKwh)} (margin {f(o.check.marginKwh)} kWh)</div>
            : <button className="btn" onClick={() => setReveal(true)}>Reveal simulated outcome</button>}
        </div>; })}
      </div>
      <p className="text-[12px] text-muted mb-3" aria-live="polite"><b className="text-ink">7 · Difference (B − A).</b>{" "}
        {Math.abs(dReduction) < 0.05 ? "No meaningful difference: both hold the same demand target with these cells." :
          `${dReduction > 0 ? "+" : ""}${f(dReduction, 2)} kW lower demand target, $${f(dReduction * G2.usdPerKwMonth, 0)}/month at G-2.`}
        {" "}Same cells, same twin, same 95% rule and same data, so this is physical bypass value only (information and decision-rule value are held equal here and separated in the plant-scale study).</p>

      <div className="mb-3"><div className="flex flex-wrap items-center gap-3 mb-2 text-[12px]">
        <div className="seg inline-flex">{(["fixed", "bypass"] as const).map((k) => <button key={k} data-on={hw === k} onClick={() => setHw(k)}>{k === "fixed" ? "A" : "B"}</button>)}</div>
        <span className="num w-[130px]">{he(hour)}</span>
        <input className="flex-1 min-w-[160px]" type="range" min={1} max={24} value={hour} onChange={(e) => setHour(+e.target.value)} aria-label="Hour of the peak day" />
      </div>
        <SiteScene3D loadKw={loadNow} batteryKw={battNow} gridKw={continuity?.gridKw[idx] ?? loadNow} targetKw={pick!.rec.target.targetKw} hourLabel={he(hour)} label={HW[hw]} />
        <LoadChart load={res.load} dtH={dtH} a={A!.rec.target.targetKw} b={B!.rec.target.targetKw} hour={hour} />
      </div>

      {continuity && <section className="rounded-lg border border-[#8fc9ad] bg-[#eef8f2] p-4 mb-3 text-[12px] text-muted">
        <div className="flex flex-wrap justify-between gap-2"><div><div className="micro mb-1">24-hour operating continuity · grid-connected</div>
          <div className="text-[18px] font-semibold text-[#176b4b]">Facility load served: {continuity.servedIntervals}/{res.load.length} intervals</div></div>
          <div className="num text-right">battery online: standby / discharge / recharge<br />dispatch shortfall {f(continuity.dispatchShortfallKwh)} kWh</div></div>
        <div className="grid sm:grid-cols-4 gap-2 mt-3">
          <div><b className="text-ink">Peak discharge</b><br />{f(continuity.dischargedKwh)} kWh</div>
          <div><b className="text-ink">Minimum stored</b><br />{f(continuity.minStoredKwh)} kWh ≥ {f(continuity.reserveKwh)} kWh reserve</div>
          <div><b className="text-ink">Off-peak recharge</b><br />{f(continuity.chargedFromGridKwh)} kWh from grid</div>
          <div><b className="text-ink">End of day</b><br />{f(continuity.endStoredKwh)} / {f(pick!.rec.energyLimitKwh)} kWh</div>
        </div>
        <ContinuityChart plan={continuity} initialKwh={pick!.rec.energyLimitKwh} />
        <p className="mt-2 text-faint">The site stays powered because the utility grid supplies the balance while the battery is in standby or charging. The battery does not discharge continuously; it remains available, preserves reserve, then recharges after the peak without exceeding the demand target. Outage backup and islanding are not claimed here.</p>
      </section>}

      <div className="text-[12px] mb-3"><div className="micro mb-1">8 · Sensitivity (same data; belief P5 → demand reduction, $/month)</div>
        <table className="w-full num text-[11.5px]"><thead><tr className="text-faint text-left"><th>Cell state</th><th>A kW</th><th>B kW</th><th>B − A at $10 / G-2 $15.24 / $20</th></tr></thead><tbody>
          {E.energy_curves.map((c) => { const ra = recommend(res.load, dtH, E.rated_kw, c.belief.fixed.kw, c.belief.fixed.p5, reservePct / 100).target.reductionKw;
            const rb = recommend(res.load, dtH, E.rated_kw, c.belief.bypass.kw, c.belief.bypass.p5, reservePct / 100).target.reductionKw;
            return <tr key={c.weak_factor} className="border-t border-line"><td className="font-sans">{c.weak_factor === 1 ? "natural spread" : `one cell at ${c.weak_factor * 100}%`}</td><td>{f(ra, 2)}</td><td>{f(rb, 2)}</td>
              <td>{[10, G2.usdPerKwMonth, 20].map((u) => `$${f((rb - ra) * u, 0)}`).join(" / ")}</td></tr>; })}</tbody></table>
        <div className="text-faint mt-1">$10 and $20/kW-month are ASSUMED sensitivity values; $15.24 is the confirmed G-2 charge. Unknown EBS parameters (cells, N_min, DC floor, R_on) shift the energy curves; see the block study below.</div></div>

      <div className="flex flex-wrap gap-2 items-center text-[12px]"><span className="micro">9 · Export</span>
        <button className="btn" onClick={() => download("peaksure_report.json", JSON.stringify(report(), null, 1), "application/json")}>Report (JSON)</button>
        <button className="btn" onClick={() => download("peaksure_report.md", md(), "text/markdown")}>Report (Markdown)</button>
        <span className="text-faint">Includes the input checksum, assumptions and limitations so the result can be reproduced.</span></div>
    </>}
  </section>;
}

function ContinuityChart({ plan, initialKwh }: { plan: ContinuityPlan; initialKwh: number }) {
  const W = 640, H = 92, L = 34, T = 8, IW = W - L - 8, IH = H - T - 18;
  const x = (i: number) => L + (i / Math.max(1, plan.storedKwh.length - 1)) * IW;
  const y = (v: number) => T + IH * (1 - v / Math.max(initialKwh, 1));
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3" role="img" aria-label="Battery stored energy over the 24-hour grid-connected operating schedule">
    <line x1={L} x2={L + IW} y1={y(plan.reserveKwh)} y2={y(plan.reserveKwh)} stroke="#4aa3ff" strokeDasharray="4 3" />
    <polyline points={plan.storedKwh.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#137454" strokeWidth="3" />
    {plan.modes.map((m, i) => m === "standby" ? null : <circle key={i} cx={x(i)} cy={y(plan.storedKwh[i])} r="3" fill={m === "charge" ? "#3479a2" : "#137454"} />)}
    {[0, 6, 12, 18, 24].map((h) => <text key={h} x={L + (h / 24) * IW} y={H - 3} fontSize="10" fill="#687b70" textAnchor="middle">{h}:00</text>)}
    <text x={4} y={T + 9} fontSize="10" fill="#687b70">kWh</text><text x={L + 3} y={y(plan.reserveKwh) - 3} fontSize="9" fill="#3479a2">reserve</text>
  </svg>;
}

function LoadChart({ load, dtH, a, b, hour }: { load: number[]; dtH: number; a: number; b: number; hour: number }) {
  const W = 640, H = 120, L = 34, T = 8, IW = W - L - 8, IH = H - T - 20;
  const mx = Math.max(...load) * 1.05, X = (i: number) => L + (i / load.length) * IW, Y = (v: number) => T + IH * (1 - v / mx);
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label="Peak-day facility load with the A and B demand targets">
    <polyline points={load.map((v, i) => `${X(i)},${Y(v)} ${X(i + 1)},${Y(v)}`).join(" ")} fill="none" stroke="#5f7884" strokeWidth="2" />
    <line x1={L} x2={L + IW} y1={Y(a)} y2={Y(a)} stroke="#687a83" strokeDasharray="5 3" /><text x={L + IW} y={Y(a) - 3} textAnchor="end" fontSize="10" fill="#687a83">A target {a.toFixed(1)} kW</text>
    <line x1={L} x2={L + IW} y1={Y(b)} y2={Y(b)} stroke="#137454" strokeDasharray="2 2" /><text x={L + IW} y={Y(b) + 11} textAnchor="end" fontSize="10" fill="#137454">B target {b.toFixed(1)} kW</text>
    <line x1={X((hour - 1) / dtH)} x2={X((hour - 1) / dtH)} y1={T} y2={T + IH} stroke="#3479a2" />
    {[0, 6, 12, 18, 24].map((h) => <text key={h} x={X(h / dtH)} y={H - 4} fontSize="10" fill="#687b70" textAnchor="middle">{h}:00</text>)}
    <text x={4} y={T + 10} fontSize="10" fill="#687b70">kW</text>
  </svg>;
}
