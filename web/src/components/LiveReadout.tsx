"use client";
// Live per-system numbers under the 3D view, computed from the same discharge runs.
import { Scenario } from "@/engine/scenario";
import { runStats } from "@/engine/cellview";
import { useStudio } from "@/state/store";
import { Slot } from "./Battery3D";
import { BATTERY_NAMES } from "@/engine/labels";

const SUB: Record<Slot, string> = { A: "fixed strings · annual pack test", B: "cell bypass · annual pack test", C: "cell bypass · per-cell twin, 95% commit" };
const kwh = (v: number) => `${Math.max(0, Math.round(v)).toLocaleString()} kWh`;

export default function LiveReadout({ scenario, view, slots }: { scenario: Scenario; view: "peak" | "drain"; slots: Slot[] }) {
  const minute = useStudio((s) => (view === "drain" ? s.drainMin : s.minute));
  const { nSeries: N, nStrings: S } = scenario.sys;
  return (
    <div className="grid gap-2 px-2 pt-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
      {slots.map((k) => {
        const op = scenario.ops[k];
        const run = view === "drain" ? op.drain! : op.run;
        const st = runStats(run, op.tier, minute, scenario.chem.vNom, N, S);
        const d = op.decision;
        // Charge a full drain at rated power would leave behind (same cells, same day): what the hardware cannot reach.
        const dr = op.drain!;
        const drainEnd = runStats(dr, op.tier, dr.startMin + dr.nFrames - 1, scenario.chem.vNom, N, S);
        const rows: [string, string, string?][] = [
          ["Delivered so far", kwh(st.deliveredKwh)],
          ["Still in usable cells", kwh(st.usableKwh)],
          view === "peak"
            ? ["Stranded if drained to empty", kwh(drainEnd.strandedKwh), drainEnd.strandedKwh > 0.5 ? "#b77712" : undefined]
            : ["Stranded (string stopped)", kwh(st.strandedKwh), st.strandedKwh > 0.5 ? "#b77712" : undefined],
          ["Strings running", `${st.stringsOn} / ${S}`],
          ["Cells in circuit", `${st.activeCells.toLocaleString()} / ${(S * N).toLocaleString()}`],
          ["Cells switched out", st.bypassed.toLocaleString()],
          ["Cells replaced by year " + scenario.age, op.cellsReplaced.toLocaleString()],
        ];
        return (
          <div key={k} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 min-w-0">
            <div className="text-[12px] font-bold">{BATTERY_NAMES[k]}</div>
            <div className="text-[10.5px] text-faint mb-2">{SUB[k]}</div>
            {view === "peak" && (
              <div className="text-[11px] text-muted mb-2 num">
                {d.powerKw > 0 ? `Commits ${(d.powerKw / 1000).toFixed(2)} MW · HE${d.startHe}${d.windowH > 1 ? `–${d.startHe + d.windowH - 1}` : ""} (${d.windowH} h)` : "No commitment"}
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[11px]">
              {rows.map(([a, b, col]) => (
                <div key={a} className="contents"><span className="text-faint truncate">{a}</span><span className="num text-right" style={col ? { color: col, fontWeight: 700 } : undefined}>{b}</span></div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
