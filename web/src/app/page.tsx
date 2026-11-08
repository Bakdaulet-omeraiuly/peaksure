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
import WeakCellFlow from "@/components/WeakCellFlow";
import { slotsFor } from "@/components/Battery3D";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

export default function Explore() {
  const { scenario, c, events, ms } = useScenario();
  const baseline = useStudio((s) => s.baseline);
  const playback = useRef<HTMLDetailsElement>(null);
  const view = useStudio((s) => s.view);
  const drainPlaying = useStudio((s) => s.drainPlaying);
  const drainMin = useStudio((s) => s.drainMin);
  const colorMode = useStudio((s) => s.colorMode);
  const slots = slotsFor(view);
  const drainEnd = scenario ? Math.max(scenario.ops.A.drain!.nFrames, scenario.ops.B.drain!.nFrames) - 1 : 0;
  const showBypass = () => {
    if (!scenario) return;
    const event = scenario.ops.B.drain!.events.find((e) => e.kind === "empty") ?? scenario.ops.B.drain!.events.find((e) => e.kind === "hot");
    useStudio.getState().set({ view: "drain", playing: false, drainMin: Math.max(0, (event?.minute ?? 0) - 60), drainPlaying: true });
  };
  // drain-test playback (minutes since full charge)
  useEffect(() => {
    if (!drainPlaying || !scenario) return;
    const end = drainEnd;
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
  }, [drainPlaying, scenario, drainEnd]);
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-6 max-w-[760px]">
          <div className="eyebrow mb-3">PeakSure · battery decision intelligence</div>
          <h1 className="page-title">Know what the battery can commit.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted max-w-[650px]">Three modeled operators on the same cells and ISO-NE peak: a conventional fixed-string battery, an EBS-equivalent plant with cell bypass, and that plant with PeakSure&apos;s cell twin and 95% confidence commitment. The 3D racks show assumed wiring, not an EBS hardware layout.</p>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="seg inline-flex"><button data-on={view === "peak"} onClick={() => useStudio.getState().set({ view: "peak", drainPlaying: false })}>Peak day</button><button data-on={view === "drain"} onClick={() => useStudio.getState().set({ view: "drain", playing: false, drainMin: 0 })}>Drain test: full to empty</button></div>
            <span className="text-[11px] text-faint max-w-[460px]">{view === "peak" ? "What each operator commits and delivers at the real peak hour." : "Same cells at full rated power until every string stops: shows the hardware difference (stranded charge) without any operator decision."}</span>
          </div>
          {scenario && <button className="btn btn-accent mt-3" onClick={showBypass}>Show the weak-cell bypass</button>}
        </div>
        <div className="explore-grid">
          <main className="surface overflow-hidden min-w-0 p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} view={view} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <>
                <div className="absolute top-3 left-4 right-4 flex flex-wrap justify-center gap-x-4 gap-y-1 pointer-events-none text-[10px] text-[#aab8b0]">
                  {(colorMode === "soc" ? [["#7ee2a0", "charged"], ["#1f2a2d", "used"], ["#ef4a3c", "limiting"], ["#e9a23b", "stranded"], ["#68737c", "bypassed"]] : colorMode === "temp" ? [["#2b5d9a", "cool"], ["#58a6a6", "moderate"], ["#e0a53a", "warm"], ["#ef5a50", "hot"], ["#68737c", "bypassed"]] : colorMode === "soh" ? [["#a33a30", "low health"], ["#d39a35", "mid health"], ["#4fbf85", "high health"], ["#68737c", "bypassed"]] : [["#262b31", "low uncertainty"], ["#5a4b8a", "mid uncertainty"], ["#c49cf2", "high uncertainty"], ["#68737c", "bypassed"]]).map(([color, label]) => <span key={label}><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: color }} />{label}</span>)}
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
            {scenario && view === "drain" && <div className="px-3 pt-3 flex items-center gap-3 text-[11px] text-muted">
              <button className="btn" onClick={() => useStudio.getState().set({ drainMin: 0, drainPlaying: true })}>Replay</button>
              <span className="num shrink-0">t+{Math.floor(drainMin)} min</span>
              <input className="flex-1 min-w-0" type="range" min={0} max={drainEnd} step={1} value={drainMin} onChange={(e) => useStudio.getState().set({ drainMin: +e.target.value, drainPlaying: false })} aria-label="Drain test timeline" />
              <span className="num shrink-0">{drainEnd} min</span>
            </div>}
            {scenario && <WeakCellFlow scenario={scenario} view={view} />}
            {scenario && view === "peak" && scenario.ops.C.run.energyKwh > 1.05 * Math.max(scenario.ops.A.run.energyKwh, scenario.ops.B.run.energyKwh) && <p className="px-3 pt-2 text-[11px] text-faint">Dark cells on the PeakSure battery are charge it chose to deliver across a longer window, not damage. The other operators leave that charge unused.</p>}
            {scenario && view === "peak" && Math.abs(scenario.ops.A.run.energyKwh - scenario.ops.C.run.energyKwh) < 0.01 * Math.max(1, scenario.ops.C.run.energyKwh) && Math.abs(scenario.ops.B.run.energyKwh - scenario.ops.C.run.energyKwh) < 0.01 * Math.max(1, scenario.ops.C.run.energyKwh) && <p className="px-3 pt-2 text-[11px] text-faint">All three deliver the same energy at this peak, so energy is not the binding limit here. Switch to <button className="underline text-[var(--accent)]" onClick={() => useStudio.getState().set({ view: "drain", playing: false, drainMin: 0 })}>Drain test</button> to see the hardware difference: stranded charge in fixed strings.</p>}
            {scenario && <StringStrip scenario={scenario} view={view} slots={slots} />}
            {scenario && c && view === "peak" && <details ref={playback} className="disclosure"><summary>View peak-day playback</summary><Timeline scenario={scenario} c={c} baseline={baseline} /></details>}
          </main>
          {scenario && c && <Inspector sc={scenario} c={c} baseline={baseline} />}
        </div>
        <YearlyCompare />
        {c && events && <details className="surface disclosure mt-4"><summary>Change scenario and assumptions</summary><ScenarioPanel c={c} events={events} ms={ms} /></details>}
        <p className="mt-5 text-[11px] text-faint leading-relaxed">Independent simulation using public inputs and stated assumptions. REON says CESS/OES are white-label; its cell-control product is EBS. EBS wiring and the baseline control policy are unverified. Results may favor either operator and are not hardware validation.</p>
      </div>
    </div>
  );
}
