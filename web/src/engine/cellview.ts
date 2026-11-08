// Display helpers shared by the 3D view, the string strip and the live readouts.
// Pure functions of a DischargeResult; no physics here.
import { DischargeResult } from "./discharge";
import { Tier } from "./physics";

export type CellState = "charged" | "culprit" | "bypassed" | "stranded" | "empty";

export const frameOf = (run: DischargeResult, minute: number) =>
  Math.min(Math.max(Math.floor(minute) - run.startMin, 0), run.nFrames - 1);

/**
 * charged  – carrying current (or not yet started)
 * culprit  – fixed string: the empty cell that stopped its whole string
 * bypassed – REON: cell switched out (empty or resting hot) while its string keeps running
 * stranded – string has stopped but this cell still holds charge
 * empty    – string stopped and the cell is empty (REON cut-off at N_min)
 */
export function cellState(run: DischargeResult, tier: Tier, f: number, i: number, nSeries: number, nStrings: number): CellState {
  const SN = nSeries * nStrings;
  if (f === 0 || run.active[f * SN + i]) return "charged";
  const s = Math.floor(i / nSeries);
  const soc = run.soc[f * SN + i];
  if (!run.stringsOnline[f * nStrings + s]) {
    if (soc > 0.01) return "stranded";
    return tier === "fixed" ? "culprit" : "empty";
  }
  return "bypassed";
}

export interface RunStats { deliveredKwh: number; usableKwh: number; strandedKwh: number; stringsOn: number; activeCells: number; bypassed: number }

export function runStats(run: DischargeResult, tier: Tier, minute: number, vNom: number, nSeries: number, nStrings: number): RunStats {
  const SN = nSeries * nStrings, f = frameOf(run, minute);
  let delivered = 0;
  const end = Math.min(Math.floor(minute), run.startMin + run.nFrames - 1);
  for (let m = run.startMin; m < end; m++) delivered += run.powerKw[m] ?? 0;
  let usable = 0, stranded = 0, bypassed = 0, on = 0, activeCells = 0;
  for (let s = 0; s < nStrings; s++) on += run.stringsOnline[f * nStrings + s];
  for (let i = 0; i < SN; i++) {
    activeCells += run.active[f * SN + i];
    const kwh = (run.soc[f * SN + i] * run.fullAh[i] * vNom) / 1000;
    const st = cellState(run, tier, f, i, nSeries, nStrings);
    if (st === "stranded") stranded += kwh;
    else if (st === "bypassed") bypassed++;
    else if (st === "charged") usable += kwh;
  }
  return { deliveredKwh: delivered / 60, usableKwh: usable, strandedKwh: stranded, stringsOn: on, activeCells, bypassed };
}

/** Cell-by-cell comparison of two runs at the same clock minute (same cell indices, same scenario). */
export interface RunDiff { cellsDiffering: number; deliveredDiffKwh: number; strandedDiffKwh: number; usableDiffKwh: number; negligible: boolean }

export function cellDiffers(x: DischargeResult, tx: Tier, y: DischargeResult, ty: Tier, minute: number, i: number,
                            nSeries: number, nStrings: number, socTol = 0.02): boolean {
  const SN = nSeries * nStrings, fx = frameOf(x, minute), fy = frameOf(y, minute);
  const sx = cellState(x, tx, fx, i, nSeries, nStrings), sy = cellState(y, ty, fy, i, nSeries, nStrings);
  const outX = sx !== "charged", outY = sy !== "charged";
  return outX !== outY || Math.abs(x.soc[fx * SN + i] - y.soc[fy * SN + i]) > socTol;
}

export function compareRuns(x: DischargeResult, tx: Tier, y: DischargeResult, ty: Tier, minute: number, vNom: number,
                            nSeries: number, nStrings: number, relTol = 0.01): RunDiff {
  const SN = nSeries * nStrings;
  let n = 0;
  for (let i = 0; i < SN; i++) if (cellDiffers(x, tx, y, ty, minute, i, nSeries, nStrings)) n++;
  const a = runStats(x, tx, minute, vNom, nSeries, nStrings), b = runStats(y, ty, minute, vNom, nSeries, nStrings);
  const dd = a.deliveredKwh - b.deliveredKwh, ds = a.strandedKwh - b.strandedKwh, du = a.usableKwh - b.usableKwh;
  const scale = Math.max(1, a.deliveredKwh, b.deliveredKwh, a.usableKwh, b.usableKwh);
  const negligible = n === 0 || (Math.abs(dd) < relTol * scale && Math.abs(ds) < relTol * scale && Math.abs(du) < relTol * scale);
  return { cellsDiffering: n, deliveredDiffKwh: dd, strandedDiffKwh: ds, usableDiffKwh: du, negligible };
}

/** Key moments taken from engine events only (null when the event does not happen in this run). */
export interface KeyMoments { before: number; limiting: number | null; bypass: number | null; result: number }

export function keyMoments(fixedRun: DischargeResult, bypassRun: DischargeResult): KeyMoments {
  const start = Math.min(fixedRun.startMin, bypassRun.startMin);
  const end = Math.max(fixedRun.startMin + fixedRun.nFrames, bypassRun.startMin + bypassRun.nFrames) - 1;
  const lim = fixedRun.events.find((e) => e.kind === "string-stop" || e.kind === "derate");
  const byp = bypassRun.events.find((e) => e.kind === "empty" || e.kind === "hot");
  return { before: Math.max(0, start - 10), limiting: lim ? lim.minute : null, bypass: byp ? byp.minute : null, result: end };
}
