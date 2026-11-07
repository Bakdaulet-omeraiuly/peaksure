"use client";
import { useEffect, useState } from "react";
import { Scenario, OperatorResult } from "@/engine/scenario";
import { Constants, fetchJson } from "@/engine/data";
import { useStudio } from "@/state/store";

const usd = (x: number) => (Math.abs(x) >= 1000 ? `$${(x / 1000).toFixed(1)}K` : `$${x.toFixed(0)}`);
const kwh = (x: number) => `${Math.round(x).toLocaleString()} kWh`;
const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <div className="panel-h" style={{ borderBottom: "none", height: 30 }}><span className="micro">{title}</span>{right}</div>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}

function Commit({ op, sc, minute }: { op: OperatorResult; sc: Scenario; minute: number }) {
  const d = op.decision;
  const color = op.key === "A" ? "var(--conv)" : "var(--accent)";
  const peakEnd = sc.event.he * 60;
  const decided = minute >= peakEnd;
  const hit = op.shavedKw > 0;
  return (
    <div className="rounded-md border border-line bg-panel-2 p-2.5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex justify-between items-baseline">
        <span className="text-[12px] font-semibold" style={{ color }}>{op.key === "A" ? "Conventional" : "REON + PeakSure"}</span>
        <span className="text-[10.5px] text-faint">{op.key === "A" ? "pack test · full-power rule" : "cell twin · 95% commit"}</span>
      </div>
      <div className="num text-[15px] mt-1">{Math.round(d.powerKw).toLocaleString()} kW <span className="text-muted text-[12px]">x {d.windowH} h from HE{d.startHe}</span></div>
      <div className="grid grid-cols-2 gap-x-2 mt-1 text-[11.5px]">
        <span className="text-faint">believed P5</span><span className="num text-right">{kwh(op.belief.p5)}</span>
        <span className="text-faint">true deliverable</span><span className="num text-right">{kwh(op.truthKwh)}</span>
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-line text-[12px] flex justify-between">
        {decided ? (
          <><span style={{ color: hit ? "var(--ok)" : "var(--error)" }}>{hit ? `Shaved ${Math.round(op.shavedKw).toLocaleString()} kW at the peak` : "Missed the peak hour"}</span>
            <span className="num">{usd(op.valueUsd)}</span></>
        ) : <span className="text-faint">awaiting peak hour HE{sc.event.he}</span>}
      </div>
    </div>
  );
}

function BeliefChart({ sc }: { sc: Scenario }) {
  const ops = [sc.ops.A, sc.ops.C];
  const qs = ops.flatMap((o) => { const v = [...o.belief.samples].sort((a, b) => a - b); return [v[0], v[v.length - 1], o.truthKwh]; });
  const lo = Math.min(...qs) * 0.985, hi = Math.max(...qs) * 1.01;
  const W = 272, H = 132, X = (v: number) => 10 + ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (W - 20);
  const row = (o: OperatorResult, y: number, color: string, label: string) => {
    const s = [...o.belief.samples].sort((a, b) => a - b);
    const bins = 34, counts = new Array(bins).fill(0);
    s.forEach((v) => { counts[Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))]++; });
    const mx = Math.max(...counts), bw = (W - 20) / bins;
    const ce = o.decision.powerKw * o.decision.windowH;
    return (
      <g>
        <text x={10} y={y - 34} fontSize={10.5} fill="#a2aab5">{label}</text>
        {counts.map((n, i) => <rect key={i} x={10 + i * bw} y={y - (n / mx) * 24} width={Math.max(bw - 0.6, 0.6)} height={(n / mx) * 24} fill={color} opacity={0.8} />)}
        <line x1={10} x2={W - 10} y1={y} y2={y} stroke="#2e353d" />
        <line x1={X(o.belief.p5)} x2={X(o.belief.p5)} y1={y - 28} y2={y + 2} stroke={color} strokeDasharray="2 2" />
        <line x1={X(o.truthKwh)} x2={X(o.truthKwh)} y1={y - 30} y2={y + 3} stroke="#f0736a" strokeWidth={2} />
        {ce >= lo ? <path d={`M${X(ce)},${y + 3} l4,5 l-4,5 l-4,-5 z`} fill="#e8eaed" />
                  : <text x={10} y={y + 12} fontSize={10} fill="#e8eaed">&#9664; committed {Math.round(ce).toLocaleString()} kWh (power-limited)</text>}
      </g>
    );
  };
  return (
    <div>
      <svg width={W} height={H} className="block">
        {row(sc.ops.A, 52, "#9aa6b8", "Conventional: annual pack test")}
        {row(sc.ops.C, 116, "#7bd88f", "PeakSure: per-cell twin")}
      </svg>
      <div className="flex justify-between text-[10.5px] text-faint num"><span>{Math.round(lo).toLocaleString()} kWh</span><span>{Math.round(hi).toLocaleString()} kWh</span></div>
      <div className="text-[10.5px] text-faint mt-1">red: truth &middot; dashed: believed P5 &middot; diamond: committed energy</div>
    </div>
  );
}

function telemetry(op: OperatorResult, minute: number) {
  const r = op.run, SN = op.qRel.length;
  const f = Math.min(Math.max(Math.floor(minute) - r.startMin, 0), r.nFrames - 1);
  let act = 0, tmax = -Infinity, smin = Infinity, on = 0;
  for (let i = 0; i < SN; i++) {
    if (r.active[f * SN + i]) { act++; smin = Math.min(smin, r.soc[f * SN + i]); }
    tmax = Math.max(tmax, r.temp[f * SN + i]);
  }
  for (let s = 0; s < 8; s++) on += r.stringsOnline[f * 8 + s];
  let e = 0;
  for (let m = 0; m < Math.min(1440, Math.floor(minute)); m++) e += (r.powerKw[m] ?? 0) / 60;
  return { p: r.powerKw[Math.min(1439, Math.floor(minute))] ?? 0, e, act, tmax, smin: act ? smin : 0, on };
}

export default function Inspector({ sc, c }: { sc: Scenario; c: Constants }) {
  const { minute, probeBudget, reportBias, hover, set, town } = useStudio();
  const [cal, setCal] = useState<{ mode: string; eps: number; cond: string; miss: number }[] | null>(null);
  useEffect(() => { fetchJson<{ cal: { mode: string; eps: number; cond: string; miss: number }[] }>("/data/results.json").then((r) => setCal(r.cal)); }, []);
  const tA = telemetry(sc.ops.A, minute), tC = telemetry(sc.ops.C, minute);
  const evs = [...sc.ops.A.run.events.map((e) => ({ ...e, op: "A" as const })), ...sc.ops.C.run.events.map((e) => ({ ...e, op: "C" as const }))]
    .filter((e) => e.minute <= minute).sort((a, b) => b.minute - a.minute);
  const sysMiss = cal?.find((r) => r.mode === "sys" && r.cond === "C" && Math.abs(r.eps - Math.round(reportBias * 1000) / 100) < 1e-6);
  const cust = c.towns[town]?.customers ?? 1;
  const hoverInfo = hover ? (() => {
    const op = sc.ops[hover.op], N = op.qRel.length / 8, i = hover.string * N + hover.cell;
    const f = Math.min(Math.max(Math.floor(minute) - op.run.startMin, 0), op.run.nFrames - 1);
    return { op, i, soh: op.qRel[i], soc: op.run.soc[f * op.qRel.length + i], t: op.run.temp[f * op.qRel.length + i],
             act: op.run.active[f * op.qRel.length + i], tm: op.twinMean?.[i], ts: op.twinSd?.[i],
             lim: op.key === "A" && op.limiting?.[hover.string] === hover.cell };
  })() : null;

  return (
    <aside className="studio-inspector surface min-w-0 overflow-hidden">
      <div className="panel-h"><span className="micro">Decision comparison</span><span className="text-[11px] text-faint num">{usd(sc.rateUsdPerKw)}/kW</span></div>
      <div className="p-3 flex flex-col gap-2">
        <Commit op={sc.ops.A} sc={sc} minute={minute} />
        <Commit op={sc.ops.C} sc={sc} minute={minute} />
        {minute >= sc.event.he * 60 && (
          <div className="text-[11.5px] text-muted">
            Difference at this peak: <span className="num text-ink">{usd(sc.ops.C.valueUsd - sc.ops.A.valueUsd)}</span>
            {" "}(<span className="num">{((sc.ops.C.valueUsd - sc.ops.A.valueUsd) / cust).toFixed(2)}</span> $ per {town} customer)
          </div>
        )}
      </div>
      <details className="disclosure"><summary>Technical diagnostics</summary>
      <Section title="Deliverable energy: belief vs truth">
        <BeliefChart sc={sc} />
      </Section>
      <Section title="Live telemetry" right={<span className="num text-[11px] text-faint">{fmt(minute)}</span>}>
        <table className="w-full text-[11.5px] num">
          <thead><tr className="text-faint"><td></td><td className="text-right">Conv.</td><td className="text-right">PeakSure</td></tr></thead>
          <tbody>
            {[["Power kW", Math.round(tA.p).toLocaleString(), Math.round(tC.p).toLocaleString()],
              ["Delivered kWh", Math.round(tA.e).toLocaleString(), Math.round(tC.e).toLocaleString()],
              ["Strings online", `${tA.on}/8`, `${tC.on}/8`],
              ["Active cells", tA.act, tC.act],
              ["Lowest SOC", `${(tA.smin * 100).toFixed(0)}%`, `${(tC.smin * 100).toFixed(0)}%`],
              ["Hottest cell", `${tA.tmax.toFixed(1)} C`, `${tC.tmax.toFixed(1)} C`]].map(([k, a, b]) => (
              <tr key={k as string} className="border-t border-line"><td className="text-muted py-0.5 font-sans">{k}</td><td className="text-right">{a}</td><td className="text-right">{b}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Diagnostics: VoI probes" right={<span className="badge">stated capability</span>}>
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={8} value={probeBudget} onChange={(e) => set({ probeBudget: +e.target.value })} />
          <span className="num text-[12px] w-6 text-right">{probeBudget}</span>
        </div>
        <div className="text-[11.5px] text-muted mt-1 leading-snug">
          Switch a cell in or out to measure it. PeakSure probes only cells whose uncertainty changes the commitment.
          {probeBudget > 0 && ` Used ${sc.ops.C.probes.length} of ${probeBudget}.`}
        </div>
        {sc.ops.C.probes.map((p, k) => (
          <div key={k} className="text-[11.5px] num flex justify-between mt-1 text-probe">
            <span>cell {p.string + 1}-{p.cell + 1}</span>
            <span>{(p.priorMean * 100).toFixed(1)}±{(p.priorSd * 100).toFixed(1)} → {(p.postMean * 100).toFixed(1)}±{(p.postSd * 100).toFixed(1)}%</span>
          </div>
        ))}
      </Section>
      <Section title="Calibration watchdog" right={<span className="num text-[11px] text-faint">bias {(reportBias * 100).toFixed(0)}%</span>}>
        <input type="range" min={0} max={0.03} step={0.01} value={reportBias} onChange={(e) => set({ reportBias: +e.target.value })} />
        <div className="text-[11.5px] text-muted mt-1 leading-snug">
          Systematic error in per-cell capacity reports. Monte Carlo: twin P5 miss rate {sysMiss ? <b className="num text-ink">{(sysMiss.miss * 100).toFixed(1)}%</b> : "n/a"} (target 5%).
          {reportBias > 0 ? " The twin is confidently wrong; the watchdog switches to conservative commitments when misses exceed their bound." : ""}
        </div>
      </Section>
      {hoverInfo && (
        <Section title={`Cell ${hover!.string + 1}-${hover!.cell + 1} · ${hoverInfo.op.key === "A" ? "conventional" : "REON"}`}>
          <div className="grid grid-cols-2 text-[11.5px] num gap-y-0.5">
            <span className="text-faint font-sans">state of health</span><span className="text-right">{(hoverInfo.soh * 100).toFixed(1)}%</span>
            <span className="text-faint font-sans">charge now</span><span className="text-right">{(hoverInfo.soc * 100).toFixed(0)}%</span>
            <span className="text-faint font-sans">temperature</span><span className="text-right">{hoverInfo.t.toFixed(1)} C</span>
            <span className="text-faint font-sans">status</span><span className="text-right">{hoverInfo.act ? "in path" : "bypassed / off"}</span>
            {hoverInfo.tm !== undefined && <><span className="text-faint font-sans">twin estimate</span><span className="text-right">{(hoverInfo.tm * 100).toFixed(1)} ± {((hoverInfo.ts ?? 0) * 100).toFixed(1)}%</span></>}
            {hoverInfo.lim && <span className="col-span-2 text-error font-sans">limits its whole string</span>}
          </div>
        </Section>
      )}
      <Section title="Event log">
        <div className="text-[11.5px] num max-h-48 overflow-y-auto scroll">
          {evs.length === 0 && <div className="text-faint font-sans">Press "Run the peak".</div>}
          {evs.slice(0, 60).map((e, k) => (
            <div key={k} className="flex gap-2 py-0.5 border-t border-line">
              <span className="text-faint">{fmt(e.minute)}</span>
              <span style={{ color: e.op === "A" ? "var(--conv)" : "var(--accent)" }}>{e.op === "A" ? "CONV" : "REON"}</span>
              <span className="font-sans text-muted">{e.text}</span>
            </div>
          ))}
        </div>
      </Section>
      </details>
    </aside>
  );
}
