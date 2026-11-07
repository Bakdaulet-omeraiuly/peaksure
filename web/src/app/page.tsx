"use client";
import dynamic from "next/dynamic";
import AppBar from "@/components/AppBar";
import ScenarioPanel from "@/components/ScenarioPanel";
import Inspector from "@/components/Inspector";
import Timeline from "@/components/Timeline";
import { useScenario } from "@/state/useScenario";
import { useStudio } from "@/state/store";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

export default function Explore() {
  const { scenario, c, events, ms } = useScenario();
  const baseline = useStudio((s) => s.baseline);
  const baselineLabel = baseline === "B" ? "REON bypass (modeled baseline)" : "Conventional";
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-6 max-w-[760px]">
          <div className="eyebrow mb-3">PeakSure · battery decision intelligence</div>
          <h1 className="page-title">Know what the battery can commit.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted max-w-[650px]">Compare the same modeled REON battery with and without PeakSure&apos;s cell-level twin and 95% confidence commitment. Select a conventional battery as another baseline.</p>
          <div className="seg mt-3 inline-flex"><button data-on={baseline === "B"} onClick={() => useStudio.getState().set({ baseline: "B", playing: false })}>REON baseline</button><button data-on={baseline === "A"} onClick={() => useStudio.getState().set({ baseline: "A", playing: false })}>Conventional</button></div>
        </div>
        <div className="explore-grid">
          <main className="surface overflow-hidden min-w-0 p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} baseline={baseline} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <>
                <div className="absolute top-4 left-4 right-4 grid grid-cols-2 gap-4 pointer-events-none text-[10px] sm:text-[12px] font-semibold text-[#e3eae5]">
                  <div className="text-center">{baselineLabel}</div><div className="text-center">REON + PeakSure</div>
                </div>
                <div className="studio-stage-note">Drag to rotate · Hover to inspect a cell</div>
              </>}
            </div>
            {scenario && c && <details className="disclosure"><summary>View peak-day playback</summary><Timeline scenario={scenario} c={c} baseline={baseline} /></details>}
          </main>
          {scenario && c && <Inspector sc={scenario} c={c} baseline={baseline} />}
        </div>
        {c && events && <details className="surface disclosure mt-4"><summary>Change scenario and assumptions</summary><ScenarioPanel c={c} events={events} ms={ms} /></details>}
        <p className="mt-5 text-[11px] text-faint leading-relaxed">Independent simulation using public inputs and stated assumptions. The REON baseline control policy is assumed, not verified as REON&apos;s current software. Results may favor either operator and are not REON hardware validation.</p>
      </div>
    </div>
  );
}
