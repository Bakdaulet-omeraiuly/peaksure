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
  const A = scenario?.ops.A;
  const C = scenario?.ops.C;
  const delta = A && C ? C.truthKwh / A.truthKwh - 1 : 0;
  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-7 max-w-[840px]">
          <div className="eyebrow mb-3">Battery decision intelligence</div>
          <h1 className="page-title">Commit to the peak with confidence.</h1>
          <p className="mt-3 text-[14px] sm:text-[16px] leading-relaxed text-muted max-w-[700px]">Explore how cell bypass and a cell level estimate change what a battery can safely deliver during an ISO-NE peak.</p>
        </div>
        {scenario && A && C && (
          <div className="metric-grid mb-4">
            <div className="surface metric"><div className="micro mb-2">Conventional deliverable energy</div><div className="metric-value num">{Math.round(A.truthKwh).toLocaleString()} <span className="text-[13px] text-muted">kWh</span></div></div>
            <div className="surface metric"><div className="micro mb-2">REON deliverable energy</div><div className="metric-value num text-accent">{Math.round(C.truthKwh).toLocaleString()} <span className="text-[13px] text-muted">kWh</span></div><div className="text-[11px] text-muted mt-1">{delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}% from the same cells</div></div>
            <div className="surface metric"><div className="micro mb-2">PeakSure commitment</div><div className="metric-value num">{Math.round(C.decision.powerKw).toLocaleString()} <span className="text-[13px] text-muted">kW</span></div><div className="text-[11px] text-muted mt-1">{C.decision.windowH} h window · 95% deliverability target</div></div>
          </div>
        )}
        <div className="studio-grid">
          {c && events && <ScenarioPanel c={c} events={events} ms={ms} />}
          <main className="studio-main surface overflow-hidden p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <>
                <div className="absolute top-4 left-4 right-4 grid grid-cols-2 gap-4 pointer-events-none text-[10px] sm:text-[12px] font-semibold text-[#e3eae5]">
                  <div className="text-center">Conventional <span className="block font-normal text-[#aabbb1]">Fixed strings</span></div>
                  <div className="text-center">REON + PeakSure <span className="block font-normal text-[#aabbb1]">Cell bypass</span></div>
                </div>
                <div className="studio-stage-note">Drag to rotate · Scroll to zoom · Hover to inspect a cell</div>
              </>}
            </div>
            {scenario && c && <Timeline scenario={scenario} c={c} />}
          </main>
          {scenario && c && <Inspector sc={scenario} c={c} />}
        </div>
        <p className="mt-5 text-[11px] text-faint leading-relaxed">Independent model using public inputs and stated assumptions. Simulated results are not hardware validation or an endorsement by REON.</p>
      </div>
    </div>
  );
}
