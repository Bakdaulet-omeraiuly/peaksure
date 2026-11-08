"use client";
// Compact per-battery cards under the 3D view. Every number is read from the same discharge runs.
import { Scenario } from "@/engine/scenario";
import { compareRuns, runStats } from "@/engine/cellview";
import { heClock } from "@/engine/commitment";
import { BATTERY_NAMES, BATTERY_SUB } from "@/engine/labels";
import { useStudio } from "@/state/store";
import { Slot } from "./Battery3D";

const kwh = (v: number) => `${Math.max(0, Math.round(v)).toLocaleString()} kWh`;
const mwh = (k: number) => `${(k / 1000).toFixed(2)} MWh`;
const OK: Record<string, [string, string]> = {
  feasible: ["✓ within belief", "var(--ok)"], "no-commitment": ["no commitment", "inherit"],
  "exceeds-belief": ["⚠ above own P5", "var(--error)"], "exceeds-rated": ["⚠ above rating", "var(--error)"],
};

export default function LiveReadout({ scenario, view, slots }: { scenario: Scenario; view: "peak" | "drain"; slots: Slot[] }) {
  const minute = useStudio((s) => (view === "drain" ? s.drainMin : s.minute));
  const { nSeries: N, nStrings: S } = scenario.sys;
  const vNom = scenario.chem.vNom;
  const runOf = (k: Slot) => (view === "drain" ? scenario.ops[k].drain! : scenario.ops[k].run);
  const diff = compareRuns(runOf("B"), "bypass", runOf("A"), "fixed", minute, vNom, N, S);
  const cm0 = scenario.ops.A.commitment;
  return (
    <>
      <div className="px-3 pt-2 text-[11.5px] text-muted num">
        {(cm0.ratedPowerKw / 1000).toFixed(1)} MW · {(cm0.ratedEnergyKwh / 1000).toFixed(1)} MWh ({cm0.nominalRatioH.toFixed(0)} h nominal) · battery year {scenario.age} ({scenario.calYear}) · peak HE{scenario.event.he} ({heClock(scenario.event.he)}), {scenario.event.date}
      </div>
      <div className="grid gap-2 px-2 pt-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((k) => {
          const op = scenario.ops[k];
          const run = runOf(k);
          const st = runStats(run, op.tier, minute, vNom, N, S);
          const dr = op.drain!;
          const drainEnd = runStats(dr, op.tier, dr.startMin + dr.nFrames - 1, vNom, N, S);
          const stopped = run.events.filter((e) => e.kind === "string-stop" && e.minute <= minute).length;
          const cm = op.commitment;
          const [okTxt, okCol] = OK[cm.status];
          const rows: [string, string, string?][] = [
            ["Delivered", kwh(st.deliveredKwh)],
            ["Charge left", kwh(st.usableKwh)],
            ["Stranded", kwh(view === "peak" ? drainEnd.strandedKwh : st.strandedKwh), "#b77712"],
            ["Strings on", `${st.stringsOn}/${S}`],
            op.tier === "fixed" ? ["Strings stopped", String(stopped)] : ["Cells bypassed", st.bypassed.toLocaleString()],
          ];
          return (
            <div key={k} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 min-w-0">
              <div className="text-[13px] font-bold leading-tight">{BATTERY_NAMES[k]}</div>
              <div className="text-[11px] text-faint mb-2">{BATTERY_SUB[k]}</div>
              {view === "peak" && (cm.powerKw > 0 ? (
                <div className="text-[12px] mb-2 leading-snug">
                  <div className="num"><b>{(cm.powerKw / 1000).toFixed(2)} MW × {cm.durationH} h = {mwh(cm.energyKwh)}</b></div>
                  <div className="text-muted">HE{cm.startHe}{cm.durationH > 1 ? `–${cm.endHe}` : ""} · P5 {mwh(cm.believedP5Kwh)} · <span style={{ color: okCol }}>{okTxt}</span></div>
                </div>) : <div className="text-[12px] text-muted mb-2">No commitment</div>)}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                {rows.map(([a, b, col]) => [
                  <span key={`${a}-k`} className="text-faint">{a}</span>,
                  <span key={`${a}-v`} className="num text-right" style={col && parseFloat(b) > 0 ? { color: col, fontWeight: 700 } : undefined}>{b}</span>,
                ])}
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-3 pt-2 text-[12px] text-muted num" aria-live="polite">
        <b className="text-ink">B − A now:</b>{" "}
        {diff.negligible ? "no meaningful difference" : `${diff.cellsDiffering.toLocaleString()} cells differ · delivered ${diff.deliveredDiffKwh >= 0 ? "+" : ""}${Math.round(diff.deliveredDiffKwh).toLocaleString()} kWh · stranded ${diff.strandedDiffKwh >= 0 ? "+" : ""}${Math.round(diff.strandedDiffKwh).toLocaleString()} kWh`}
        {view === "peak" && " · Stranded = charge left if drained to empty"}
      </p>
    </>
  );
}
