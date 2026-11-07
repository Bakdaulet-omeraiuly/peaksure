"use client";
import dynamic from "next/dynamic";
import AppBar from "@/components/AppBar";
import ScenarioPanel from "@/components/ScenarioPanel";
import Inspector from "@/components/Inspector";
import Timeline from "@/components/Timeline";
import { useScenario } from "@/state/useScenario";
import { useStudio } from "@/state/store";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

const LEGEND: Record<string, [string, string][]> = {
  soc: [["#7bd88f", "full"], ["#c98a2b", "low"], ["#2a1416", "empty"], ["#232930", "bypassed / string off"], ["#f2b84b", "VoI probe"]],
  soh: [["#4fbf85", "healthy"], ["#c98a2b", "75%"], ["#8a2f2a", "≤ 50%"]],
  temp: [["#2b5d9a", "10 C"], ["#58a6a6", "28 C"], ["#e0a53a", "38 C"], ["#e8584f", "≥ 50 C"]],
  sd: [["#2a2f36", "certain"], ["#5a4b8a", "±1%"], ["#c49cf2", "≥ ±3%"]],
};

export default function Studio() {
  const { scenario, c, events, ms } = useScenario();
  const colorMode = useStudio((s) => s.colorMode);
  const minute = useStudio((s) => s.minute);
  const ctx = scenario && (
    <>REON CES {c!.p_max_kw / 1000} MW / {(scenario.eNom / 1000).toFixed(1)} MWh &middot; {c!.chemistry.split(" (")[0]} &middot;
      ISO-NE {scenario.event.date} HE{scenario.event.he} &middot; {scenario.event.t_amb_c.toFixed(1)} C &middot; year {scenario.age} ({scenario.calYear})</>
  );
  const A = scenario?.ops.A, C = scenario?.ops.C;
  const more = A && C ? C.truthKwh / A.truthKwh - 1 : 0;
  return (
    <div className="h-screen flex flex-col">
      <AppBar context={ctx} />
      <div className="flex-1 flex min-h-0">
        {c && events && <ScenarioPanel c={c} events={events} ms={ms} />}
        <main className="flex-1 flex flex-col min-w-0">
          {scenario && A && C && (
            <div className="h-[58px] shrink-0 grid grid-cols-5 border-b border-line bg-panel">
              {[
                ["Deliverable now, conventional", `${Math.round(A.truthKwh).toLocaleString()} kWh`, "weakest cell sets each string"],
                ["Deliverable now, REON bypass", `${Math.round(C.truthKwh).toLocaleString()} kWh`, more >= 0 ? `${(more * 100).toFixed(1)}% more from the same cells` : `${(-more * 100).toFixed(1)}% less: hot cells resting, full power kept`],
                ["Committed, conventional", `${Math.round(A.decision.powerKw).toLocaleString()} kW x ${A.decision.windowH} h`, `HE${A.decision.startHe}–${A.decision.startHe + A.decision.windowH - 1}`],
                ["Committed, PeakSure", `${Math.round(C.decision.powerKw).toLocaleString()} kW x ${C.decision.windowH} h`, `HE${C.decision.startHe}–${C.decision.startHe + C.decision.windowH - 1} · 95% deliverable`],
                ["This peak is worth", `$${scenario.rateUsdPerKw.toFixed(2)} / kW`, scenario.event.is_annual ? "monthly RNS + annual capacity" : "monthly RNS transmission"],
              ].map(([l, v, n], i) => (
                <div key={i} className="px-3 py-1.5 border-r border-line last:border-r-0">
                  <div className="micro truncate">{l}</div>
                  <div className="num text-[15px] leading-tight" style={{ color: i === 1 || i === 3 ? "var(--accent)" : "var(--text)" }}>{v}</div>
                  <div className="text-[10.5px] text-faint truncate">{n}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex-1 relative min-h-0 bg-black">
            {scenario ? <Battery3D scenario={scenario} /> : <div className="absolute inset-0 grid place-items-center text-faint text-[13px]">Loading model data…</div>}
            {scenario && (
              <>
                <div className="absolute top-2 left-3 text-[11px] text-faint num leading-relaxed pointer-events-none">
                  8 strings x 240 switchable cells per container &middot; N_min {scenario.sys.nMin} (DC window, assumed)<br />
                  container {scenario.tContainer.toFixed(1)} C &middot; drag to orbit, scroll to zoom, hover a cell
                </div>
                <div className="absolute top-2 right-3 flex gap-3 text-[11px] text-muted pointer-events-none">
                  {LEGEND[colorMode].map(([col, l]) => (
                    <span key={l} className="flex items-center gap-1"><i style={{ width: 9, height: 9, background: col, display: "inline-block", borderRadius: 2 }} />{l}</span>
                  ))}
                </div>
                <div className="absolute top-[52px] left-0 right-0 grid grid-cols-2 pointer-events-none">
                  <div className="text-center"><div className="micro" style={{ color: "var(--conv)" }}>Conventional &middot; fixed series strings</div>
                    <div className="text-[11px] text-faint">same current through every cell; the first empty cell stops the string</div></div>
                  <div className="text-center"><div className="micro" style={{ color: "var(--accent)" }}>REON bypass + PeakSure</div>
                    <div className="text-[11px] text-faint">empty or hot cells leave the path; the string runs while &ge; N_min cells are active</div></div>
                </div>
                <div className="absolute bottom-2 left-3 text-[11px] text-faint pointer-events-none">
                  {minute < Math.min(A!.run.startMin, C!.run.startMin) ? "Before discharge: full charge. Press Run the peak." : ""}
                </div>
              </>
            )}
          </div>
          {scenario && c && <Timeline scenario={scenario} c={c} />}
        </main>
        {scenario && c && <Inspector sc={scenario} c={c} />}
      </div>
    </div>
  );
}
