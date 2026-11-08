"use client";
// Shared Play / Pause / Reset, timeline and step-through for every battery shown (one clock for all of them).
// The steps jump to minutes taken from engine events; a step that did not happen is disabled and says so.
import { Scenario } from "@/engine/scenario";
import { keyMoments } from "@/engine/cellview";
import { heClock } from "@/engine/commitment";
import { useStudio } from "@/state/store";

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m % 60)).padStart(2, "0")}`;

export default function PlaybackBar({ scenario, view }: { scenario: Scenario; view: "peak" | "drain" }) {
  const s = useStudio();
  const drain = view === "drain";
  const A = drain ? scenario.ops.A.drain! : scenario.ops.A.run;
  const B = drain ? scenario.ops.B.drain! : scenario.ops.B.run;
  const runs = drain ? [A, B] : [A, B, scenario.ops.C.run];
  const km = keyMoments(A, B);
  const lo = drain ? 0 : Math.max(0, Math.min(...runs.map((r) => r.startMin)) - 60);
  const hi = drain ? Math.max(...runs.map((r) => r.startMin + r.nFrames - 1)) : Math.min(1439, Math.max(...runs.map((r) => r.startMin + r.nFrames)) + 45);
  const minute = drain ? s.drainMin : s.minute;
  const playing = drain ? s.drainPlaying : s.playing;
  const go = (m: number, play = false) => s.set(drain ? { drainMin: Math.min(hi, Math.max(lo, m)), drainPlaying: play } : { minute: Math.min(hi, Math.max(lo, m)), playing: play });
  const label = (m: number) => (drain ? `t+${Math.floor(m)} min` : clock(m));
  const steps: [string, number | null, string][] = [
    ["Before peak", drain ? 0 : km.before, "all cells charged, nothing switched"],
    ["Limiting cell", km.limiting, drain ? "first fixed string stops (its emptiest cell)" : "first fixed-string stop or heat derate"],
    ["Bypass decision", km.bypass, "first cell the REON-style model switches out"],
    ["Result", km.result, "end of the run"],
  ];
  return (
    <div className="px-3 pt-3 grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <button className="btn" onClick={() => go(minute >= hi ? lo : minute, !playing)} aria-pressed={playing}>{playing ? "Pause" : "Play"}</button>
        <button className="btn" onClick={() => go(lo)}>Reset</button>
        <span className="num shrink-0 w-[72px]">{label(minute)}</span>
        <input className="flex-1 min-w-[120px]" type="range" min={lo} max={hi} step={1} value={Math.min(hi, Math.max(lo, minute))}
               onChange={(e) => go(+e.target.value)} aria-label="Shared timeline for all batteries" />
        <span className="num shrink-0">{label(hi)}</span>
      </div>
      <ol className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Step through the comparison">
        {steps.map(([name, m, hint], k) => (
          <li key={name}>
            <button className="btn" disabled={m === null} onClick={() => m !== null && go(m)}
                    title={m === null ? `${name}: does not happen in this scenario` : `${hint} (${label(m)})`}>
              {k + 1}. {name}{m === null ? " · none here" : ` · ${label(m)}`}
            </button>
          </li>
        ))}
      </ol>
      {!drain && <div className="text-[10.5px] text-faint">Actual peak hour: HE{scenario.event.he} = {heClock(scenario.event.he)} on {scenario.event.date}. HE is a clock hour, not a duration or battery age.</div>}
    </div>
  );
}
