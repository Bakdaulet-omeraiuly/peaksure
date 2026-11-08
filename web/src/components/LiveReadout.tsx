"use client";
// Live per-system numbers under the 3D view, computed from the same discharge runs.
// Quantities are kept apart: rated power/energy (system), commitment power/window/energy (decision),
// battery age (years) vs calendar year, and HE (a clock hour).
import { Scenario } from "@/engine/scenario";
import { compareRuns, runStats } from "@/engine/cellview";
import { BOUNDARY, durationNote, heClock } from "@/engine/commitment";
import { BATTERY_NAMES, BATTERY_SUB } from "@/engine/labels";
import { useStudio } from "@/state/store";
import { Slot } from "./Battery3D";

const kwh = (v: number) => `${Math.max(0, Math.round(v)).toLocaleString()} kWh`;
const mw = (kw: number) => `${(kw / 1000).toFixed(2)} MW`;
const mwh = (k: number) => `${(k / 1000).toFixed(2)} MWh`;
const STATUS: Record<string, [string, string]> = {
  feasible: ["within belief (P5) and rating", "var(--ok)"],
  "no-commitment": ["no commitment", "var(--text-faint, #888)"],
  "exceeds-belief": ["exceeds the operator's believed P5", "var(--error)"],
  "exceeds-rated": ["exceeds the rated energy: infeasible", "var(--error)"],
};

export function SystemStrip({ scenario }: { scenario: Scenario }) {
  const s = scenario.ops.A.commitment;
  const hypothetical = scenario.durationKey !== "2h";
  return (
    <div className="px-3 pt-2 text-[11px] text-muted leading-relaxed">
      <b className="text-ink">System (all batteries):</b> rated power {mw(s.ratedPowerKw)} · rated energy {mwh(s.ratedEnergyKwh)} (model DC nameplate
      {hypothetical ? ", hypothetical size" : ", same as published CESS rating; basis unstated"}) · nominal ratio {s.nominalRatioH.toFixed(0)} h (derived, not a guaranteed AC duration)
      {" "}· battery age year {scenario.age} = calendar {scenario.calYear} · peak HE{scenario.event.he} ({heClock(scenario.event.he)}) on {scenario.event.date}
      {" "}· {scenario.sameCells ? "identical cells in every battery" : "same year-0 cells, each hardware's own ageing"}.
      {" "}Commitment windows are chosen by each operator and need not equal the nominal ratio. Energy is measured at the {BOUNDARY.replace("AC", "AC side")} unless a row says &ldquo;in cells&rdquo;.
    </div>
  );
}

export default function LiveReadout({ scenario, view, slots }: { scenario: Scenario; view: "peak" | "drain"; slots: Slot[] }) {
  const minute = useStudio((s) => (view === "drain" ? s.drainMin : s.minute));
  const { nSeries: N, nStrings: S } = scenario.sys;
  const vNom = scenario.chem.vNom;
  const runOf = (k: Slot) => (view === "drain" ? scenario.ops[k].drain! : scenario.ops[k].run);
  const diff = compareRuns(runOf("B"), "bypass", runOf("A"), "fixed", minute, vNom, N, S);
  return (
    <>
      <SystemStrip scenario={scenario} />
      <div className="grid gap-2 px-2 pt-2" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
        {slots.map((k) => {
          const op = scenario.ops[k];
          const run = runOf(k);
          const st = runStats(run, op.tier, minute, vNom, N, S);
          const cm = op.commitment;
          const dr = op.drain!;
          const drainEnd = runStats(dr, op.tier, dr.startMin + dr.nFrames - 1, vNom, N, S);
          const limiting = op.tier === "fixed" ? run.events.filter((e) => e.kind === "string-stop" && e.minute <= minute).length : 0;
          const rows: [string, string, string?][] = [
            ["Delivered so far (AC)", kwh(st.deliveredKwh)],
            ["Charge still in usable cells (in cells)", kwh(st.usableKwh)],
            view === "peak"
              ? ["Stranded if drained to empty (in cells)", kwh(drainEnd.strandedKwh), drainEnd.strandedKwh > 0.5 ? "#b77712" : undefined]
              : ["Stranded, string stopped (in cells)", kwh(st.strandedKwh), st.strandedKwh > 0.5 ? "#b77712" : undefined],
            ["Strings running", `${st.stringsOn} / ${S}`],
            ["Cells in circuit", `${st.activeCells.toLocaleString()} / ${(S * N).toLocaleString()}`],
            op.tier === "fixed" ? ["Strings stopped by their emptiest cell", limiting.toLocaleString()] : ["Cells switched out (bypassed)", st.bypassed.toLocaleString()],
            [`Cells replaced by age ${scenario.age}`, op.cellsReplaced.toLocaleString()],
          ];
          const [stTxt, stCol] = STATUS[cm.status];
          const note = view === "peak" && cm.durationH > 1 ? durationNote(cm) : null;
          return (
            <div key={k} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 min-w-0">
              <div className="text-[12px] font-bold">{BATTERY_NAMES[k]}</div>
              <div className="text-[10.5px] text-faint mb-2">{BATTERY_SUB[k]}</div>
              {view === "peak" && (
                <div className="text-[11px] text-muted mb-2 num leading-snug">
                  {cm.powerKw > 0 ? <>
                    <div>Commits {mw(cm.powerKw)} × {cm.durationH} h = <b className="text-ink">{mwh(cm.energyKwh)}</b></div>
                    <div>Window HE{cm.startHe}{cm.durationH > 1 ? `–${cm.endHe}` : ""} ({heClock(cm.startHe).slice(0, 5)}–{heClock(cm.endHe).slice(6)})</div>
                    <div>Believed P5 {mwh(cm.believedP5Kwh)} · <span style={{ color: stCol }}>{stTxt}</span></div>
                    {note && <div className="text-faint font-sans mt-0.5">{note}</div>}
                  </> : "No commitment"}
                </div>
              )}
              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[11px]">
                {rows.map(([a, b, col]) => (
                  <div key={a} className="contents"><span className="text-faint truncate" title={a}>{a}</span><span className="num text-right" style={col ? { color: col, fontWeight: 700 } : undefined}>{b}</span></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="px-3 pt-2 text-[11px] text-muted" aria-live="polite">
        <b className="text-ink">Hardware difference now (B − A, same clock):</b>{" "}
        {diff.negligible
          ? `negligible: ${diff.cellsDiffering.toLocaleString()} cells differ, delivered ${Math.round(diff.deliveredDiffKwh)} kWh, usable charge ${Math.round(diff.usableDiffKwh)} kWh.`
          : `${diff.cellsDiffering.toLocaleString()} cells differ; delivered ${diff.deliveredDiffKwh >= 0 ? "+" : ""}${Math.round(diff.deliveredDiffKwh).toLocaleString()} kWh, usable charge ${diff.usableDiffKwh >= 0 ? "+" : ""}${Math.round(diff.usableDiffKwh).toLocaleString()} kWh, stranded ${diff.strandedDiffKwh >= 0 ? "+" : ""}${Math.round(diff.strandedDiffKwh).toLocaleString()} kWh.`}
        {!scenario.sameCells && " A's cells aged on their own path, so part of any difference is ageing, not bypass alone."}
        {" "}Bypass does not create energy: it only lets the string keep using charge that a fixed string strands.
      </p>
    </>
  );
}
