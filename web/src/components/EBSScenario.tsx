"use client";
// EBS C&I demand-charge scenario: same cells, same belief, same 95% rule; only the hardware differs.
// Before the window ends only the belief is shown; the simulated plant outcome is revealed afterwards.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/engine/data";
import { heClock } from "@/engine/commitment";
import { EbsScenarioFile, decode, demandValue, frameAt, stages, summary, cellStates, EBS_STATE_LABEL } from "@/engine/ebsScenario";

const EBSPair3D = dynamic(() => import("@/components/EBSPair3D"), { ssr: false });
const f1 = (v: number, d = 1) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const STATUS: Record<string, string> = {
  feasible: "feasible: within rating and the operator's own P5", "no-commitment": "no commitment",
  "exceeds-belief": "flagged: above the operator's own P5", "exceeds-rated": "infeasible: above rated energy",
};
const Badge = ({ s }: { s: string }) => <span className="inline-block rounded px-1 mr-1 text-[9.5px] font-semibold text-white align-middle"
  style={{ background: { CONFIRMED: "#2f9a6a", "REON CLAIM": "#b07a1f", DERIVED: "#4f7f9b", ASSUMED: "#8a6d3b", UNKNOWN: "#a33a30", "MODEL OUTPUT": "#5b6575", LITERATURE: "#6b6bb0" }[s] ?? "#5b6575" }}>{s}</span>;

export default function EBSScenario() {
  const [d, setD] = useState<EbsScenarioFile | null>(null);
  const [hours, setHours] = useState(2);
  const [weak, setWeak] = useState(1);
  const [tariff, setTariff] = useState<string>("G-2");
  const [mode, setMode] = useState<"window" | "drain">("window");
  const [minute, setMinute] = useState(-30);
  const [playing, setPlaying] = useState(false);
  const [difference, setDifference] = useState(false);
  const [hover, setHover] = useState<{ side: "A" | "B"; cell: number } | null>(null);
  useEffect(() => { fetchJson<EbsScenarioFile>("/data/ebs_scenario.json").then(setD); }, []);
  const c = d?.cases.find((x) => x.window_h === hours && x.weak_factor === weak);
  const runs = c ? (mode === "window" ? { fixed: c.fixed.outcome, bypass: c.bypass.outcome } : { fixed: c.fixed.drain, bypass: c.bypass.drain }) : null;
  const end = c ? (mode === "window" ? hours * 60 : Math.max(runs!.fixed.stop_min ?? 240, runs!.bypass.stop_min ?? 240) + 5) : 0;
  const lo = mode === "window" ? -30 : 0, hi = end + (mode === "window" ? 15 : 0);
  useEffect(() => { setMinute(mode === "window" ? -30 : 0); setPlaying(false); }, [hours, weak, mode]);
  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setMinute((m) => { if (m >= hi) { setPlaying(false); return hi; } return Math.min(hi, m + 5); }), 160);
    return () => window.clearInterval(t);
  }, [playing, hi]);
  const st = useMemo(() => (runs ? stages(runs, end) : null), [runs, end]);
  if (!d || !c || !runs || !st) return <div className="surface p-5 mb-4 text-[12px] text-muted">Loading EBS scenario…</div>;

  const started = minute > 0;
  const revealed = minute >= end;
  const fa = frameAt(runs.fixed.trace, minute), fb = frameAt(runs.bypass.trace, minute);
  const clock = (m: number) => { const t = (c.start_he - 1) * 60 + Math.round(m); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(((t % 60) + 60) % 60).padStart(2, "0")}`; };
  const sF = summary(d, c, "fixed"), sB = summary(d, c, "bypass");
  const usd = d.demand_charge[tariff];
  const status = (r: typeof runs.fixed, f: typeof fa) => !started ? "READY · reserve held" : f.block_online ? `DISCHARGING · ${f1(f.power_kw, 2)} kW` :
    (r.stop_min ?? 0) <= 0 ? `UNAVAILABLE · ${r.stop_reason}` : `CYCLE COMPLETE · recharge after t+${r.stop_min} min`;
  const hoverInfo = hover ? (() => {
    const fr = hover.side === "A" ? fa : fb;
    const s = cellStates(fr, hover.side === "B", started)[hover.cell];
    return { s, soc: decode(fr.soc_b64)[hover.cell] / 255 };
  })() : null;
  const go = (m: number | null) => { if (m !== null) { setMinute(Math.max(lo, Math.min(hi, m))); setPlaying(false); } };
  // stage jumps land on the first 5-minute snapshot at or after the event, so the event is visible
  const goStage = (m: number | null) => go(m === null ? null : Math.ceil(m / 5) * 5);
  const flag = (k: string) => d.flags[k]?.[0] ?? "ASSUMED";

  return <section className="surface p-5 sm:p-7 mb-4">
    <div className="eyebrow mb-2">EBS scenario · PeakSure simulation</div>
    <h2 className="text-[18px] font-semibold mb-2">One EBS block shaving a commercial facility&apos;s demand peak</h2>
    <p className="text-[12.5px] text-muted leading-relaxed max-w-[900px] mb-3">{d.use_case} Both blocks use the <b>same simulated cells</b>, the <b>same per-cell estimates</b> and the <b>same 95%-confidence rule</b>, so any difference is the physical effect of cell bypass, after the assumed switch loss. Facility peak timing, demand response, time-of-use, VPP and backup are not modelled.</p>
    <div className="rounded-lg border border-[#8fc9ad] bg-[#eef8f2] p-3 mb-3 text-[12px] text-muted"><b className="text-[#176b4b]">Operational meaning:</b> the battery can stay online all day while alternating between standby, discharge and recharge. It cannot deliver full power forever without an energy source. This event view shows one peak dispatch; the drain test intentionally runs to the safe cutoff and must not be read as normal 24/7 operation.</div>

    <div className="flex flex-wrap gap-4 items-end mb-3 text-[12px] text-muted">
      <label><span className="block font-semibold text-ink mb-1">Product profile</span>
        <select className="border border-line rounded-md p-2 bg-white" value="na" onChange={() => undefined}>
          <option value="na">EBS Na+ (simulated)</option>
          <option value="li" disabled>EBS Li+: not simulated (capacity only claimed)</option>
        </select></label>
      <label><span className="block font-semibold text-ink mb-1">Facility peak window <Badge s={flag("window")} /></span>
        <select className="border border-line rounded-md p-2 bg-white" value={hours} onChange={(e) => setHours(+e.target.value)}>
          {[1, 2, 3].map((h) => <option key={h} value={h}>{h} h · HE{c.start_he}{h > 1 ? `–${c.start_he + h - 1}` : ""}</option>)}</select></label>
      <label><span className="block font-semibold text-ink mb-1">Weakest cell <Badge s="ASSUMED" /></span>
        <select className="border border-line rounded-md p-2 bg-white" value={weak} onChange={(e) => setWeak(+e.target.value)}>
          <option value={1}>natural spread only</option><option value={0.9}>stress: one cell at 90%</option><option value={0.8}>stress: one cell at 80%</option></select></label>
      <label><span className="block font-semibold text-ink mb-1">Demand charge <Badge s={flag("demand_charge")} /></span>
        <select className="border border-line rounded-md p-2 bg-white" value={tariff} onChange={(e) => setTariff(e.target.value)}>
          {Object.entries(d.demand_charge).map(([k, v]) => <option key={k} value={k}>{k === "G-2" ? `$${v}/kW-month · National Grid MA G-2 (confirmed)` : `$${v}/kW-month · ${k} (assumed)`}</option>)}</select></label>
      <div className="seg inline-flex"><button data-on={mode === "window"} onClick={() => setMode("window")}>Peak window</button><button data-on={mode === "drain"} onClick={() => setMode("drain")}>Drain test (30 kW to stop)</button></div>
    </div>

    <div className="text-[11.5px] text-muted leading-relaxed mb-3 border-l-2 border-line pl-3">
      <b className="text-ink">Quantities.</b> Rated power {d.rated_kw} kW <Badge s={flag("rated_kw")} /> · rated energy {d.rated_kwh} kWh <Badge s={flag("rated_kwh")} /> (EBS line heading; AC/DC boundary and rated-vs-usable not stated) ·
      nominal ratio {f1(sF.nominalRatioH, 0)} h <Badge s="DERIVED" /> (not a guaranteed AC duration) · model AC energy boundary: cells × voltage × {Math.round(d.eta * 100)}% efficiency <Badge s="ASSUMED" /> ·
      peak window {heClock(c.start_he).slice(0, 5)}–{heClock(c.start_he + hours - 1).slice(6)} (HE{c.start_he}{hours > 1 ? `–${c.start_he + hours - 1}` : ""}; a clock time, not a duration) ·
      battery age: new cells <Badge s="ASSUMED" /> (no ageing or calendar year in this single event) · temperature not modelled <Badge s={flag("temperature")} />.
    </div>

    <div className="grid md:grid-cols-2 gap-3 mb-3">
      {([["A · Conventional battery", "fixed series string, no bypass", c.fixed, sF], ["B · REON-style EBS model", "per-cell bypass while ≥ N_min cells and DC floor allow", c.bypass, sB]] as const).map(([t, sub, h, s]) => (
        <div key={t} className="rounded-lg border border-line p-3 text-[12px]">
          <div className="font-semibold">{t}</div><div className="text-[11px] text-faint mb-2">{sub}</div>
          <div className="micro mb-1">Before the event: belief and decision</div>
          <div className="num">Twin estimate of deliverable AC energy at {f1(h.commit_kw, 2)} kW: P5 {f1(h.belief_p5)} · P50 {f1(h.belief_p50)} · P95 {f1(h.belief_p95)} kWh <Badge s="MODEL OUTPUT" /></div>
          <div className="num">Commitment {f1(s.powerKw, 2)} kW × {s.durationH} h = <b>{f1(s.energyKwh)} kWh</b> · model chance of delivery {f1(h.chance * 100, 0)}%</div>
          <div style={{ color: s.status === "feasible" ? "var(--ok)" : "var(--error)" }}>{STATUS[s.status]}</div>
          <div className="micro mt-2 mb-1">After the event: simulated plant state</div>
          {revealed ? <div className="num">
            Delivered {f1(h.outcome.delivered_kwh)} kWh · {h.outcome.fulfilled ? "commitment fulfilled" : `commitment missed (stopped t+${h.outcome.stop_min} min: ${h.outcome.stop_reason})`}<br />
            Forecast vs outcome: {f1(Math.abs(h.outcome.delivered_kwh - s.energyKwh) < 0.05 ? 0 : h.outcome.delivered_kwh - s.energyKwh)} kWh vs committed · demand reduction {h.outcome.fulfilled ? f1(h.commit_kw, 2) : "0 (worst case)"} kW → ${f1(demandValue(h, usd), 0)}/month <Badge s="MODEL OUTPUT" />
          </div> : <div className="text-faint">hidden until the window ends (press Play or jump to Result)</div>}
        </div>))}
    </div>
    {revealed && <p className="text-[12px] text-muted mb-3" aria-live="polite"><b className="text-ink">Difference (B − A):</b>{" "}
      {Math.abs(c.bypass.commit_kw - c.fixed.commit_kw) < 0.01 && Math.abs(c.bypass.outcome.delivered_kwh - c.fixed.outcome.delivered_kwh) < 0.5
        ? "none measurable in this setting: both blocks commit and deliver the same. Cell bypass adds nothing here."
        : `${c.bypass.commit_kw - c.fixed.commit_kw >= 0 ? "+" : ""}${f1(c.bypass.commit_kw - c.fixed.commit_kw, 2)} kW committed, ${f1(c.bypass.outcome.delivered_kwh - c.fixed.outcome.delivered_kwh)} kWh delivered, $${f1(demandValue(c.bypass, usd) - demandValue(c.fixed, usd), 0)}/month at $${usd}/kW-month.`}
      {" "}Upper bound: assumes the facility&apos;s billing peak falls inside the window. Drain test: A {f1(c.fixed.drain.energy_kwh)} kWh (stops: {c.fixed.drain.stop_reason}), B {f1(c.bypass.drain.energy_kwh)} kWh (stops: {c.bypass.drain.stop_reason}). Bypass does not create energy; it can only use charge a fixed string would strand.</p>}

    <EBSPair3D a={{ frame: fa, bypass: false, title: "A · Conventional battery", sub: "fixed series string", status: status(runs.fixed, fa) }}
               b={{ frame: fb, bypass: true, title: "B · REON-style EBS model", sub: "cell bypass (schematic)", status: status(runs.bypass, fb) }}
               started={started} diagnosisCell={c.diagnosis_cell} difference={difference} onHover={setHover} />
    {hoverInfo && hover && <p className="text-[11.5px] text-muted num mt-1">Cell {hover.cell + 1} on {hover.side === "A" ? "A · Conventional" : "B · REON-style"}: {EBS_STATE_LABEL[hoverInfo.s]} · charge {f1(hoverInfo.soc * 100, 0)}% (simulated plant state){hover.cell === c.diagnosis_cell ? " · selected for diagnosis from the twin estimate" : ""}</p>}

    <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px] text-muted">
      <button className="btn" onClick={() => { if (minute >= hi) setMinute(lo); setPlaying(!playing); }} aria-pressed={playing}>{playing ? "Pause" : "Play"}</button>
      <button className="btn" onClick={() => go(lo)}>Reset</button>
      <button className="btn" data-on={difference} aria-pressed={difference} onClick={() => setDifference(!difference)}>{difference ? "Difference view: on" : "Difference view"}</button>
      <span className="num w-[90px]">{mode === "window" ? clock(minute) : `t+${minute} min`}</span>
      <input className="flex-1 min-w-[140px]" type="range" min={lo} max={hi} step={5} value={minute} onChange={(e) => go(+e.target.value)} aria-label="Shared timeline for both blocks" />
    </div>
    <ol className="flex flex-wrap gap-1.5 text-[11px] mt-2" aria-label="Stages">
      {([["Before peak", mode === "window" ? st.before : 0], ["Cell limit", st.limit], ["Bypass decision", st.bypass], ["Result", st.result]] as [string, number | null][]).map(([n, m], k) => (
        <li key={n}><button className="btn" disabled={m === null} onClick={() => goStage(m)} title={m === null ? "does not happen in this setting" : undefined}>{k + 1}. {n}{m === null ? " · none here" : ` · ${mode === "window" ? clock(m) : `t+${Math.round(m)} min`}`}</button></li>))}
    </ol>
    <p className="text-[11px] text-faint mt-2">Cell limit = first fixed-string cell below 15% charge, or the empty cell that stopped it. Bypass decision = first cell the REON-style model switched out. Both are read from the simulation; a stage that does not occur is disabled. The block frames are 5-minute snapshots.</p>
  </section>;
}
