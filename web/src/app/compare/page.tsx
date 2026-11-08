"use client";
// Compare: conventional battery vs REON EBS on the same cells, peak and random draws.
import dynamic from "next/dynamic";
import { useEffect } from "react";
import Link from "next/link";
import AppBar from "@/components/AppBar";
import ScenarioPanel from "@/components/ScenarioPanel";
import PlaybackBar from "@/components/PlaybackBar";
import LiveReadout from "@/components/LiveReadout";
import LifetimePanel from "@/components/LifetimePanel";
import { slotsFor, DIFF_COLORS } from "@/components/Battery3D";
import { useScenario } from "@/state/useScenario";
import { useStudio } from "@/state/store";

const Battery3D = dynamic(() => import("@/components/Battery3D"), { ssr: false });

export default function Compare() {
  const { scenario, c, events, ms } = useScenario();
  const view = useStudio((s) => s.view);
  const playing = useStudio((s) => s.playing);
  const drainPlaying = useStudio((s) => s.drainPlaying);
  const colorMode = useStudio((s) => s.colorMode);
  const slots = slotsFor(view);

  // one shared clock: peak-day minutes or drain-test minutes
  useEffect(() => {
    const on = view === "drain" ? drainPlaying : playing;
    if (!on || !scenario) return;
    const runs = slots.map((k) => (view === "drain" ? scenario.ops[k].drain! : scenario.ops[k].run));
    const lo = view === "drain" ? 0 : Math.max(0, Math.min(...runs.map((r) => r.startMin)) - 60);
    const hi = view === "drain" ? Math.max(...runs.map((r) => r.startMin + r.nFrames - 1)) : Math.min(1439, Math.max(...runs.map((r) => r.startMin + r.nFrames)) + 45);
    let raf = 0, prev = performance.now();
    const tick = (t: number) => {
      const st = useStudio.getState();
      const cur = view === "drain" ? st.drainMin : st.minute;
      const m = Math.max(lo, cur) + ((t - prev) / 1000) * ((hi - lo) / 14);
      prev = t;
      if (m >= hi) { st.set(view === "drain" ? { drainMin: hi, drainPlaying: false } : { minute: hi, playing: false }); return; }
      st.set(view === "drain" ? { drainMin: m } : { minute: m });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, playing, drainPlaying, scenario, slots]);

  const legend = colorMode === "diff"
    ? [[DIFF_COLORS.same, "same"], [DIFF_COLORS.inPath, "in circuit, other out"], [DIFF_COLORS.outOfPath, "out, other in"], [DIFF_COLORS.moreCharge, "more charge"], [DIFF_COLORS.lessCharge, "less charge"]]
    : colorMode === "soc" ? [["#7ee2a0", "charged"], ["#1f2a2d", "used"], ["#ef4a3c", "limiting (raised)"], ["#e9a23b", "stranded (recessed)"], ["#68737c", "bypassed (recessed)"]]
      : colorMode === "temp" ? [["#2b5d9a", "cool"], ["#58a6a6", "moderate"], ["#e0a53a", "warm"], ["#ef5a50", "hot"], ["#68737c", "bypassed"]]
        : colorMode === "soh" ? [["#a33a30", "low health"], ["#d39a35", "mid"], ["#4fbf85", "high health"], ["#68737c", "bypassed"]]
          : [["#262b31", "low uncertainty"], ["#5a4b8a", "mid"], ["#c49cf2", "high uncertainty"], ["#68737c", "bypassed"]];

  return (
    <div className="site-shell">
      <AppBar />
      <div className="page-wrap">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Compare</div>
            <h1 className="page-title">Conventional battery vs REON EBS</h1>
            <p className="mt-2 text-[13.5px] text-muted max-w-[640px]">Same cells, same ISO-NE peak, same random draws. Every highlighted cell comes from the simulation.</p>
          </div>
          <div className="seg inline-flex">
            <button data-on={view === "peak"} onClick={() => useStudio.getState().set({ view: "peak", drainPlaying: false })}>Peak day</button>
            <button data-on={view === "drain"} onClick={() => useStudio.getState().set({ view: "drain", playing: false, drainMin: 0 })}>Drain test</button>
          </div>
        </div>
        <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <main className="surface overflow-hidden min-w-0 p-2">
            <div className="studio-stage">
              {scenario ? <Battery3D scenario={scenario} view={view} /> : <div className="absolute inset-0 grid place-items-center text-[#cbd8d1] text-[13px]">Loading model data…</div>}
              {scenario && <div className="absolute top-3 left-4 right-4 flex flex-wrap justify-center gap-x-4 gap-y-1 pointer-events-none text-[10px] text-[#aab8b0]">
                {legend.map(([color, label]) => <span key={label}><i className="inline-block w-2 h-2 mr-1 rounded-sm" style={{ background: color }} />{label}</span>)}
              </div>}
            </div>
            {scenario && <PlaybackBar scenario={scenario} view={view} />}
            {scenario && <LiveReadout scenario={scenario} view={view} slots={slots} />}
            <p className="px-3 pt-3 pb-1 text-[11px] text-faint">{view === "peak" ? "Peak day: what each case commits and delivers at the real peak hour." : "Drain test: full rated power until every string stops. Shows charge each wiring strands, with no operator decision."} Schematic cell layout. Simulation results.</p>
          </main>
          {c && events && <ScenarioPanel c={c} events={events} ms={ms} />}
        </div>
        <LifetimePanel />
        <div className="mt-4 rounded-lg bg-[#153b2f] text-[#d7ebe2] px-5 py-4 text-[13px] leading-relaxed flex flex-wrap items-center justify-between gap-3">
          <span><b className="text-white">Takeaway:</b> at the peak, a healthy 2-h battery looks the same either way; over its life, bypass recovers stranded energy and avoids top-up cells, and the gap grows when cells are weak or hot.</span>
          <Link href="/" className="btn">Our recommendation →</Link>
        </div>
      </div>
    </div>
  );
}
