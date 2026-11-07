"use client";
import dynamic from "next/dynamic";
import AppBar from "@/components/AppBar";
import ScenarioPanel from "@/components/ScenarioPanel";
import Inspector from "@/components/Inspector";
import Timeline from "@/components/Timeline";
import { useScenario } from "@/state/useScenario";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

export default function Explore() {
  const { scenario, c, events, ms } = useScenario();
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-6 max-w-[760px]">
          <div className="eyebrow mb-3">PeakSure · battery decision intelligence</div>
          <h1 className="page-title">Know what the battery can commit.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted max-w-[650px]">Compare a conventional battery with REON cell bypass and PeakSure&apos;s 95% confidence commitment for the same peak.</p>
        </div>
        <div className="explore-grid">
          <main className="surface overflow-hidden min-w-0 p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <>
                <div className="absolute top-4 left-4 right-4 grid grid-cols-2 gap-4 pointer-events-none text-[10px] sm:text-[12px] font-semibold text-[#e3eae5]">
                  <div className="text-center">Conventional</div><div className="text-center">REON + PeakSure</div>
                </div>
                <div className="studio-stage-note">Drag to rotate · Hover to inspect a cell</div>
              </>}
            </div>
            {scenario && c && <details className="disclosure"><summary>View peak-day playback</summary><Timeline scenario={scenario} c={c} /></details>}
          </main>
          {scenario && c && <Inspector sc={scenario} c={c} />}
        </div>
        {c && events && <details className="surface disclosure mt-4"><summary>Change scenario and assumptions</summary><ScenarioPanel c={c} events={events} ms={ms} /></details>}
        <p className="mt-5 text-[11px] text-faint leading-relaxed">Independent simulation using public inputs and stated assumptions. Model results are not REON hardware validation.</p>
      </div>
    </div>
  );
}
