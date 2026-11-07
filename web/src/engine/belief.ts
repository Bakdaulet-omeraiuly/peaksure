// What each operator believes it can deliver at the peak.
//  - Pack estimator (conventional): annual 25 C capacity test of the whole system, nominal fade
//    extrapolation, mean-temperature correction.
//  - Cell twin (PeakSure): per-cell posterior N(mean, sd) from the Kalman twin (exported from the
//    Python run), sampled and pushed through the same tier physics, with forecast-temperature error.
import { Chem, SystemSpec, Tier, containerTemp, coldFactor, deliverable } from "./physics";
import { mulberry32, normal, quantile } from "./rng";

export interface Belief { samples: Float64Array; p5: number; p50: number; p95: number; pAvail: number }

export interface Thermal { tSet: number; kHvac: number; tOff: Float64Array; loadHeatingC: number; forecastSd: number }

export function cellTemps(tAmb: number, th: Thermal) {
  const tc = containerTemp(tAmb, th.tSet, th.kHvac);
  const t = new Float64Array(th.tOff.length);
  for (let i = 0; i < t.length; i++) t[i] = tc + th.tOff[i] + th.loadHeatingC;
  return t;
}

function summarize(samples: Float64Array, powers: number[]): Belief {
  const s = Float64Array.from(samples).sort();
  const p = powers.slice().sort((a, b) => a - b);
  return { samples, p5: quantile(s, 0.05), p50: quantile(s, 0.5), p95: quantile(s, 0.95), pAvail: p[Math.floor(p.length / 2)] };
}

export function twinBelief(mean: Float64Array, sd: Float64Array, qNom: number, tier: Tier, tForecast: number,
                           th: Thermal, chem: Chem, sys: SystemSpec, seed: number, K = 128,
                           bias = 0): Belief {
  const rand = mulberry32(seed * 7919 + 17);
  const SN = mean.length;
  const q = new Float64Array(SN);
  const out = new Float64Array(K);
  const pw: number[] = [];
  for (let k = 0; k < K; k++) {
    const tA = tForecast + th.forecastSd * normal(rand);
    const t = cellTemps(tA, th);
    for (let i = 0; i < SN; i++) q[i] = Math.max(0, (mean[i] * (1 + bias) + sd[i] * normal(rand)) * qNom);
    const soc0 = containerTemp(tA, th.tSet, th.kHvac) >= chem.tChargeMin ? 1 : 0.7;
    const d = deliverable(q, tier, soc0, t, chem, sys);
    out[k] = d.energyKwh;
    pw.push(d.powerKw);
  }
  return summarize(out, pw);
}

export function packBelief(dTestRef: number, monthsSince: number, fadeMonth: number, sigmaTest: number,
                           tForecast: number, th: Thermal, chem: Chem, sys: SystemSpec, seed: number,
                           K = 128): Belief {
  const rand = mulberry32(seed * 104729 + 3);
  const testNoise = 1 + sigmaTest * normal(rand);
  const sdRel = Math.sqrt(sigmaTest ** 2 + (0.004 * monthsSince) ** 2);
  const out = new Float64Array(K);
  const pw: number[] = [];
  for (let k = 0; k < K; k++) {
    const tA = tForecast + th.forecastSd * normal(rand);
    const t = cellTemps(tA, th);
    let mT = 0, maxT = -Infinity;
    for (let i = 0; i < t.length; i++) { mT += t[i]; if (t[i] > maxT) maxT = t[i]; }
    mT /= t.length;
    const soc0 = containerTemp(tA, th.tSet, th.kHvac) >= chem.tChargeMin ? 1 : 0.7;
    const mean = dTestRef * testNoise * (1 - fadeMonth * monthsSince) * coldFactor(mT, chem.coldSlope) * soc0;
    out[k] = Math.max(0, mean * (1 + sdRel * normal(rand)));
    // conventional BMS knows the hottest cell: whole-string derate
    const dr = Math.min(1, Math.max(0, 1 - (maxT - chem.tDerate) / Math.max(chem.tMax - chem.tDerate, 1e-6)));
    pw.push(sys.pStringMax * sys.nStrings * dr);
  }
  return summarize(out, pw);
}
