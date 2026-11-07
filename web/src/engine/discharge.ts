// Minute-by-minute discharge of the committed window, per cell.
// Fixed string: same current through all cells; the first empty cell stops the string; the hottest
// cell derates the string. Bypass (REON): an empty or hot cell leaves the path; the string runs while
// at least nMin cells are active (valid DC voltage). Energy to exhaustion equals the analytic
// deliverable() result (checked in tests).
import { Chem, SystemSpec, Tier, coldFactor, derate } from "./physics";
import { Decision } from "./decision";

export interface DischargeEvent { minute: number; string: number; cell: number; kind: "empty" | "hot" | "string-stop" | "derate"; text: string }

export interface DischargeResult {
  startMin: number;
  nFrames: number;                 // minutes in the window (+1 for the initial state)
  soc: Float32Array;               // nFrames * S*N, state of charge 0..1 (relative to full)
  active: Uint8Array;              // nFrames * S*N, 1 = carrying current
  temp: Float32Array;              // nFrames * S*N, cell temperature C
  powerKw: Float32Array;           // 1440, delivered AC power per minute
  stringsOnline: Uint8Array;       // nFrames * S
  energyKwh: number;               // delivered over the window
  events: DischargeEvent[];
  peakHourAvgKw: number;           // average delivered power during the actual peak hour
  fullAh: Float64Array;            // per-cell usable Ah at full charge (incl. cold factor), for stranded-energy display
}

export interface DischargeInput {
  qAh: Float64Array; tBase: Float64Array; rRel: Float64Array; soc0: number;
  tier: Tier; chem: Chem; sys: SystemSpec; decision: Decision; peakHe: number;
  loadHeatingC: number; tauMin?: number;
}

export function discharge(inp: DischargeInput): DischargeResult {
  const { qAh, tBase, rRel, soc0, tier, chem, sys, decision, peakHe } = inp;
  const S = sys.nStrings, N = sys.nSeries, SN = S * N;
  const tau = inp.tauMin ?? 15;
  const startMin = (decision.startHe - 1) * 60;
  const nMin = decision.windowH * 60;
  const nFrames = nMin + 1;
  const soc = new Float32Array(nFrames * SN);
  const active = new Uint8Array(nFrames * SN);
  const temp = new Float32Array(nFrames * SN);
  const online = new Uint8Array(nFrames * S);
  const power = new Float32Array(1440);
  const events: DischargeEvent[] = [];

  const full = new Float64Array(SN), avail = new Float64Array(SN), rise = new Float64Array(SN);
  const act = new Uint8Array(SN);
  for (let i = 0; i < SN; i++) {
    full[i] = qAh[i] * coldFactor(tBase[i], chem.coldSlope);
    avail[i] = full[i] * soc0;
    act[i] = 1;
  }
  const strOn = new Uint8Array(S).fill(decision.powerKw > 0 ? 1 : 0);
  const iRef = (sys.pStringMax * 1000) / (sys.eta * N * chem.vNom);
  const pStr = decision.powerKw / S;
  const effLoss = tier === "bypass" ? 1 - sys.switchLoss : 1;
  let energy = 0;

  const snap = (f: number) => {
    for (let i = 0; i < SN; i++) {
      soc[f * SN + i] = full[i] > 0 ? avail[i] / full[i] : 0;
      active[f * SN + i] = act[i];
      temp[f * SN + i] = tBase[i] + rise[i];
    }
    for (let s = 0; s < S; s++) online[f * S + s] = strOn[s];
  };
  snap(0);

  for (let m = 0; m < nMin; m++) {
    let pMinute = 0;
    for (let s = 0; s < S; s++) {
      const off = s * N;
      if (!strOn[s]) { for (let j = 0; j < N; j++) rise[off + j] *= Math.exp(-1 / tau); continue; }
      let nAct = 0, tmax = -Infinity;
      for (let j = 0; j < N; j++) if (act[off + j]) { nAct++; const t = tBase[off + j] + rise[off + j]; if (t > tmax) tmax = t; }
      const dr = derate(tmax, chem.tDerate, chem.tMax);
      if (dr < 1 && tier === "fixed" && m % 15 === 0) events.push({ minute: startMin + m, string: s, cell: -1, kind: "derate", text: `String ${s + 1} derated to ${(dr * 100).toFixed(0)}%: hottest cell ${tmax.toFixed(1)} C` });
      const p = Math.min(pStr, sys.pStringMax * dr);
      const v = nAct * chem.vNom;
      const amps = v > 0 ? (p * 1000) / (sys.eta * effLoss * v) : 0;
      const dAh = amps / 60;
      for (let j = 0; j < N; j++) {
        const i = off + j;
        const target = act[i] ? inp.loadHeatingC * (amps / iRef) ** 2 * rRel[i] : 0;
        rise[i] += (target - rise[i]) * (1 - Math.exp(-1 / tau));
        if (act[i]) avail[i] -= dAh;
      }
      pMinute += p;
      energy += p / 60;
      // state transitions
      if (tier === "fixed") {
        for (let j = 0; j < N; j++) if (avail[off + j] <= 0) {
          strOn[s] = 0;
          events.push({ minute: startMin + m + 1, string: s, cell: j, kind: "string-stop", text: `String ${s + 1} stopped: cell ${s + 1}-${j + 1} empty, ${Math.round(countAbove(avail, off, N))} cells still holding charge` });
          for (let k = 0; k < N; k++) act[off + k] = 0;
          break;
        }
      } else {
        for (let j = 0; j < N; j++) {
          const i = off + j;
          if (!act[i]) continue;
          if (avail[i] <= 0) { act[i] = 0; avail[i] = 0; events.push({ minute: startMin + m + 1, string: s, cell: j, kind: "empty", text: `Cell ${s + 1}-${j + 1} empty: bypassed` }); }
          else if (tBase[i] + rise[i] > chem.tDerate) { act[i] = 0; events.push({ minute: startMin + m + 1, string: s, cell: j, kind: "hot", text: `Cell ${s + 1}-${j + 1} at ${(tBase[i] + rise[i]).toFixed(1)} C: rested` }); }
        }
        let n2 = 0;
        for (let j = 0; j < N; j++) n2 += act[off + j];
        if (n2 < sys.nMin) {
          strOn[s] = 0;
          events.push({ minute: startMin + m + 1, string: s, cell: -1, kind: "string-stop", text: `String ${s + 1} stopped: ${n2} active cells < N_min ${sys.nMin}` });
          for (let k = 0; k < N; k++) act[off + k] = 0;
        }
      }
    }
    power[startMin + m] = pMinute;
    snap(m + 1);
  }
  const h0 = (peakHe - 1) * 60;
  let ph = 0;
  for (let m = h0; m < h0 + 60; m++) ph += power[m] ?? 0;
  return { startMin, nFrames, soc, active, temp, powerKw: power, stringsOnline: online, energyKwh: energy, events, peakHourAvgKw: ph / 60, fullAh: full };
}

function countAbove(a: Float64Array, off: number, n: number) {
  let c = 0;
  for (let j = 0; j < n; j++) if (a[off + j] > 1e-9) c++;
  return c;
}

/** Discharge at constant power until the system stops; returns delivered kWh (test helper). */
export function dischargeToEmpty(inp: Omit<DischargeInput, "decision" | "peakHe">, powerKw: number): number {
  const r = discharge({ ...inp, decision: { startHe: 1, windowH: 23, powerKw, expKw: 0 }, peakHe: 1 });
  return r.energyKwh;
}
