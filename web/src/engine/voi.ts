// Decision-focused diagnostics (port of _run_probes in peaksure/sim.py).
// Candidates are pre-screened by criticality (how often a cell sits at the rank that limits its
// string in the belief samples) x posterior sd; each candidate's value of information is the
// preposterior gain in the best expected shaved kW, holding the chosen window fixed (a lower bound).
import { Chem, SystemSpec, Tier, coldFactor } from "./physics";
import { Decision } from "./decision";
import { mulberry32, normal } from "./rng";

export interface Probe { string: number; cell: number; voiKw: number; priorMean: number; priorSd: number; postMean: number; postSd: number; measured: number }

export const MIN_VOI_KW = 0.5;   // smallest expected gain worth a probe (kW shaved)
const QZ = [-1.383, -0.674, -0.21, 0.21, 0.674, 1.383];

function stringEnergy(q: Float64Array, off: number, N: number, nMin: number, tier: Tier, soc0: number,
                      t: Float64Array, chem: Chem, sys: SystemSpec) {
  const a = new Array(N);
  for (let j = 0; j < N; j++) a[j] = q[off + j] * soc0 * coldFactor(t[off + j], chem.coldSlope);
  if (tier === "fixed") return Math.min(...a) * chem.vNom * N / 1000 * sys.eta;
  const srt = a.slice().sort((x: number, y: number) => x - y);
  const cut = srt[N - nMin];
  let s = 0;
  for (let j = 0; j < N; j++) s += Math.min(a[j], cut);
  return s * chem.vNom / 1000 * sys.eta * (1 - sys.switchLoss);
}

function bestU(d: Float64Array, dec: Decision, pHour: number[], heGrid: number[], pAvail: number, alpha: number) {
  const s = Float64Array.from(d).sort();
  const si = heGrid.indexOf(dec.startHe);
  let best = 0;
  for (let pi = 1; pi <= 80; pi++) {
    const P = (pAvail * pi) / 80;
    const pr = (x: number) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < x) lo = m + 1; else hi = m; } return 1 - lo / s.length; };
    if (pr(P * dec.windowH) < 1 - alpha) continue;
    let u = 0;
    for (let k = 1; k <= dec.windowH; k++) u += pHour[si + k - 1] * pr(P * k);
    best = Math.max(best, P * u);
  }
  return best;
}

export interface VoiInput {
  mean: Float64Array; sd: Float64Array; qTrueRel: Float64Array; qNom: number; tier: Tier; soc0: number;
  tCell: Float64Array; chem: Chem; sys: SystemSpec; dec: Decision; pHour: number[]; heGrid: number[];
  pAvail: number; alpha: number; sigmaProbe: number; budget: number; seed: number; bias?: number; K?: number;
}

/** Greedy VoI probing. Returns the probes taken and updated posterior arrays. */
export function runVoi(inp: VoiInput): { probes: Probe[]; mean: Float64Array; sd: Float64Array } {
  const { sys, tier, chem, soc0, tCell, qNom } = inp;
  const S = sys.nStrings, N = sys.nSeries, SN = S * N, K = inp.K ?? 96;
  const mean = Float64Array.from(inp.mean), sd = Float64Array.from(inp.sd);
  const rand = mulberry32(inp.seed * 31337 + 5);
  const probes: Probe[] = [];
  const r = inp.sigmaProbe ** 2;
  for (let b = 0; b < inp.budget; b++) {
    // samples
    const Z = new Float64Array(K * SN);
    for (let i = 0; i < K * SN; i++) Z[i] = normal(rand);
    const E = new Float64Array(K * S);
    const D = new Float64Array(K);
    const crit = new Float64Array(SN);
    const q = new Float64Array(SN);
    for (let k = 0; k < K; k++) {
      for (let i = 0; i < SN; i++) q[i] = Math.max(0, (mean[i] + sd[i] * Z[k * SN + i]) * qNom);
      for (let s = 0; s < S; s++) {
        const off = s * N;
        const e = stringEnergy(q, off, N, sys.nMin, tier, soc0, tCell, chem, sys);
        E[k * S + s] = e;
        D[k] += e;
        // criticality: cells at (or within 2 ranks of) the limiting rank
        const idx = Array.from({ length: N }, (_, j) => j).sort((x, y) => q[off + x] - q[off + y]);
        const kLim = tier === "fixed" ? 0 : N - sys.nMin;
        for (let rnk = Math.max(0, kLim - 2); rnk <= Math.min(N - 1, kLim + 2); rnk++) crit[off + idx[rnk]] += 1 / K;
      }
    }
    const u0 = bestU(D, inp.dec, inp.pHour, inp.heGrid, inp.pAvail, inp.alpha);
    const cand = Array.from({ length: SN }, (_, i) => i).filter((i) => crit[i] > 0)
      .sort((x, y) => crit[y] * sd[y] - crit[x] * sd[x]).slice(0, 8);
    let best = -1, bestV = MIN_VOI_KW;
    for (const c of cand) {
      const s = Math.floor(c / N), off = s * N;
      const p00 = sd[c] ** 2, predSd = Math.sqrt(p00 + r), postSd = Math.sqrt((p00 * r) / (p00 + r));
      let acc = 0;
      for (const qz of QZ) {
        const pm = mean[c] + (p00 / (p00 + r)) * predSd * qz;
        const D2 = Float64Array.from(D);
        for (let k = 0; k < K; k++) {
          const saved = q[c];
          for (let j = 0; j < N; j++) q[off + j] = Math.max(0, (mean[off + j] + sd[off + j] * Z[k * SN + off + j]) * qNom);
          q[c] = Math.max(0, (pm + postSd * Z[k * SN + c]) * qNom);
          D2[k] = D[k] - E[k * S + s] + stringEnergy(q, off, N, sys.nMin, tier, soc0, tCell, chem, sys);
          q[c] = saved;
        }
        acc += bestU(D2, inp.dec, inp.pHour, inp.heGrid, inp.pAvail, inp.alpha);
      }
      const v = acc / QZ.length - u0;
      if (v > bestV) { bestV = v; best = c; }
    }
    if (best < 0) break;
    const z = inp.qTrueRel[best] * (1 + (inp.bias ?? 0)) + inp.sigmaProbe * normal(rand);
    const p00 = sd[best] ** 2, kg = p00 / (p00 + r);
    const pr = { string: Math.floor(best / N), cell: best % N, voiKw: bestV, priorMean: mean[best], priorSd: sd[best],
                 postMean: mean[best] + kg * (z - mean[best]), postSd: Math.sqrt((1 - kg) * p00), measured: z };
    mean[best] = pr.postMean;
    sd[best] = pr.postSd;
    probes.push(pr);
  }
  return { probes, mean, sd };
}
