"use client";
import { Scenario } from "@/engine/scenario";
import { frameOf, runStats } from "@/engine/cellview";
import { useStudio } from "@/state/store";
import { BATTERY_NAMES } from "@/engine/labels";

const fmt = (m: number) => `${Math.floor(m)} min`;

export default function WeakCellFlow({ scenario, view }: { scenario: Scenario; view: "peak" | "drain" }) {
  const minute = useStudio((s) => view === "drain" ? s.drainMin : s.minute);
  const N = scenario.sys.nSeries, S = scenario.sys.nStrings;
  const a = view === "drain" ? scenario.ops.A.drain! : scenario.ops.A.run;
  const b = view === "drain" ? scenario.ops.B.drain! : scenario.ops.B.run;
  // The first cell the model actually bypasses is the most useful shared reference.
  const event = b.events.find((e) => e.kind === "empty") ?? b.events.find((e) => e.kind === "hot");
  const weakest = scenario.ops.A.qRel.reduce((best, q, i, all) => q < all[best] ? i : best, 0);
  const cell = event ? event.string * N + event.cell : weakest;
  const string = Math.floor(cell / N), j = cell % N;
  const fa = frameOf(a, minute), fb = frameOf(b, minute);
  const aOn = !!a.stringsOnline[fa * S + string];
  const bOn = !!b.stringsOnline[fb * S + string];
  const bypassed = bOn && !b.active[fb * S * N + cell];
  const aStop = a.events.find((e) => e.kind === "string-stop" && e.string === string && e.minute <= minute);
  const bStats = runStats(b, "bypass", minute, scenario.chem.vNom, N, S);
  const aStats = runStats(a, "fixed", minute, scenario.chem.vNom, N, S);
  const flowA = aOn && (a.powerKw[Math.min(1439, Math.floor(minute))] ?? 0) > 0;
  const flowB = bOn && (b.powerKw[Math.min(1439, Math.floor(minute))] ?? 0) > 0;
  const sampleStart = Math.max(0, Math.min(N - 7, j - 3));
  const sample = Array.from({ length: 7 }, (_, k) => sampleStart + k);
  const weakX = 30 + (j - sampleStart) * 44;

  return <div className="mx-2 mt-3 rounded-lg border border-[var(--border)] bg-[#0b1115] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
      <div>
        <div className="micro">Weak-cell path · string {string + 1}, cell {j + 1}</div>
        <div className="text-[11px] text-muted mt-1">Both paths use the same simulated cells and clock. Blue dots show current while this string delivers power.{view === "peak" && !event ? " No cell is bypassed in this committed peak window; use the drain test to see the modeled switch event." : ""}</div>
      </div>
      <div className="text-[11px] text-muted num">{view === "drain" ? `t+${fmt(minute)}` : `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`}</div>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {(["A", "B"] as const).map((key) => {
        const reon = key === "B", flowing = reon ? flowB : flowA;
        const off = reon && bypassed;
        const path = off ? `M20 48 H${weakX - 22} Q${weakX - 15} 48 ${weakX - 15} 35 Q${weakX - 15} 20 ${weakX} 20 Q${weakX + 15} 20 ${weakX + 15} 35 Q${weakX + 15} 48 ${weakX + 22} 48 H300` : "M20 48 H300";
        const stats = reon ? bStats : aStats;
        return <div key={key} className="rounded-md bg-[#111a20] p-2.5">
          <div className="flex justify-between gap-2 text-[11px] mb-1"><b>{BATTERY_NAMES[key]}</b><span className={flowing ? "text-[#8ddbb5]" : "text-[#f2a866]"}>{flowing ? "current flowing" : "string stopped / idle"}</span></div>
          <svg viewBox="0 0 320 91" className="w-full" role="img" aria-label={`${BATTERY_NAMES[key]} current path around cell ${string + 1}-${j + 1}`}>
            <path d={path} fill="none" stroke={flowing ? "#5fbcf4" : "#53616b"} strokeWidth="3" strokeLinecap="round" />
            {flowing && <path d={path} fill="none" stroke="#bceaff" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 19" className="current-flow" />}
            {sample.map((index, k) => {
              const x = 30 + k * 44;
              const isWeak = index === j;
              const fill = isWeak ? off ? "#68737c" : aStop && !reon ? "#ef4a3c" : "#e9a23b" : "#3fbf7f";
              return <g key={k}><rect x={x - 11} y="36" width="22" height="25" rx="3" fill={fill} stroke={isWeak ? "#f7d597" : "#293940"} strokeWidth={isWeak ? 2 : 1} />{isWeak && <text x={x} y="79" textAnchor="middle" fill="#d9e2e8" fontSize="10">weak</text>}</g>;
            })}
          </svg>
          <div className="text-[11px] text-muted">{reon ? off ? `Cell ${string + 1}-${j + 1} switched out; current takes the bypass path.` : "Weak cell remains in the path until the model switches it out." : aStop ? `Stopped at t+${fmt(aStop.minute)} when a cell emptied.` : "All cells remain in the fixed path."}</div>
          <div className="text-[10.5px] text-faint num mt-1">Active {stats.activeCells.toLocaleString()} / {(S * N).toLocaleString()} · Bypassed {stats.bypassed} · Available {stats.usableKwh.toFixed(1)} kWh</div>
        </div>;
      })}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-muted mt-2">
      <span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#3fbf7f]" />active</span><span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#e9a23b]" />weak / hot</span><span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#ef4a3c]" />limiting</span><span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#68737c]" />bypassed</span><span><i className="inline-block w-2 h-2 rounded-sm mr-1 bg-[#5fbcf4]" />current</span>
    </div>
  </div>;
}
