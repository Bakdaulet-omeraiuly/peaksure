"use client";
import dynamic from "next/dynamic";
import AppBar from "@/components/AppBar";
import ScenarioPanel from "@/components/ScenarioPanel";
import Inspector from "@/components/Inspector";
import Timeline from "@/components/Timeline";
import { useScenario } from "@/state/useScenario";
import { useStudio } from "@/state/store";
import YearlyCompare from "@/components/YearlyCompare";
import { useEffect, useRef } from "react";
import StringStrip from "@/components/StringStrip";
import LiveReadout from "@/components/LiveReadout";
import { slotsFor } from "@/components/Battery3D";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

export default function Explore() {
  const { scenario, c, events, ms } = useScenario();
  const baseline = useStudio((s) => s.baseline);
  const playback = useRef<HTMLDetailsElement>(null);
  const view = useStudio((s) => s.view);
  const drainPlaying = useStudio((s) => s.drainPlaying);
  const slots = slotsFor(view);
  // drain-test playback (minutes since full charge)
  useEffect(() => {
    if (!drainPlaying || !scenario) return;
    const end = Math.max(scenario.ops.A.drain!.nFrames, scenario.ops.B.drain!.nFrames) - 1;
    let raf = 0, prev = performance.now();
    const tick = (t: number) => {
      const m = useStudio.getState().drainMin + ((t - prev) / 1000) * (end / 14);
      prev = t;
      if (m >= end) { useStudio.getState().set({ drainMin: end, drainPlaying: false }); return; }
      useStudio.getState().set({ drainMin: m });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drainPlaying, scenario]);
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-6 max-w-[760px]">
          <div className="eyebrow mb-3">PeakSure · battery decision intelligence</div>
          <h1 className="page-title">Know what the battery can commit.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted max-w-[650px]">Three modeled batteries on the same cells and the same ISO-NE peak: a conventional fixed-string battery, REON&apos;s cell bypass with a standard operator, and REON with PeakSure&apos;s cell-level twin and 95% confidence commitment.</p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="seg inline-flex"><button data-on={view === "peak"} onClick={() => useStudio.getState().set({ view: "peak", drainPlaying: false })}>Peak day</button><button data-on={view === "drain"} onClick={() => useStudio.getState().set({ view: "drain", playing: false, drainMin: 0 })}>Drain test: full to empty</button></div>
            <span className="text-[11px] text-faint max-w-[460px]">{view === "peak" ? "What each operator commits and delivers at the real peak hour." : "Same cells at full rated power until every string stops: shows the hardware difference (stranded charge) without any operator decision."}</span>
          </div>
        </div>
        <div className="explore-grid">
          <main className="surface overflow-hidden min-w-0 p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} view={view} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <>
                <div className="absolute top-3 left-4 right-4 flex flex-wrap justify-center gap-x-4 gap-y-1 pointer-events-none text-[10px] text-[#aab8b0]">
                  <span><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#7ee2a0" }} />charged</span>
                  <span><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#1f2a2d", outline: "1px solid #3a474b" }} />used</span>
                  <span><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#ef4a3c" }} />empty cell stopped its string</span>
                  <span><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#e9a23b" }} />stranded charge</span>
                  <span><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: "#3b4a63" }} />switched out</span>
                </div>
                <div className="studio-stage-note">Drag to rotate{view === "peak" ? " · Hover to inspect a cell" : ""}</div>
                <button className="btn btn-accent absolute bottom-4 right-4 z-10" onClick={() => {
                  if (view === "drain") { useStudio.getState().set({ drainMin: 0, drainPlaying: true }); return; }
                  if (playback.current) playback.current.open = true;
                  const start = Math.min(...slots.map((k) => scenario.ops[k].run.startMin));
                  useStudio.getState().set({ minute: Math.max(0, start - 10), playing: true });
                }}>{view === "drain" ? "Drain all batteries" : "Play the peak"}</button>
              </>}
            </div>
            {scenario && <LiveReadout scenario={scenario} view={view} slots={slots} />}
            {scenario && view === "peak" && scenario.ops.C.run.energyKwh > 1.05 * Math.max(scenario.ops.A.run.energyKwh, scenario.ops.B.run.energyKwh) && <p className="px-3 pt-2 text-[11px] text-faint">Dark cells on the PeakSure battery are charge it chose to deliver across a longer window, not damage. The other operators leave that charge unused.</p>}
            {scenario && view === "peak" && Math.abs(scenario.ops.A.run.energyKwh - scenario.ops.C.run.energyKwh) < 0.01 * Math.max(1, scenario.ops.C.run.energyKwh) && Math.abs(scenario.ops.B.run.energyKwh - scenario.ops.C.run.energyKwh) < 0.01 * Math.max(1, scenario.ops.C.run.energyKwh) && <p className="px-3 pt-2 text-[11px] text-faint">All three deliver the same energy at this peak, so energy is not the binding limit here. Switch to <button className="underline text-[var(--accent)]" onClick={() => useStudio.getState().set({ view: "drain", playing: false, drainMin: 0 })}>Drain test</button> to see the hardware difference: stranded charge in fixed strings.</p>}
            {scenario && <StringStrip scenario={scenario} view={view} slots={slots} />}
            {scenario && c && view === "peak" && <details ref={playback} className="disclosure"><summary>View peak-day playback</summary><Timeline scenario={scenario} c={c} baseline={baseline} /></details>}
          </main>
          {scenario && c && <Inspector sc={scenario} c={c} baseline={baseline} />}
        </div>
        <YearlyCompare />
        {c && events && <details className="surface disclosure mt-4"><summary>Change scenario and assumptions</summary><ScenarioPanel c={c} events={events} ms={ms} /></details>}
        <p className="mt-5 text-[11px] text-faint leading-relaxed">Independent simulation using public inputs and stated assumptions. The REON baseline control policy is assumed, not verified as REON&apos;s current software. Results may favor either operator and are not REON hardware validation.</p>
      </div>
    </div>
  );
}
