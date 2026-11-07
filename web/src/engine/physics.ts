// Cell/string physics, ported 1:1 from peaksure/physics.py (cross-checked in physics.test.ts).
// Arrays are flat Float64Array of length nStrings * nSeries (string-major).

export type Tier = "fixed" | "bypass";

export interface Chem {
  vNom: number;
  coldSlope: number;
  tChargeMin: number;
  tDerate: number;
  tMax: number;
}

export interface SystemSpec {
  nStrings: number;
  nSeries: number;
  nMin: number;
  eta: number;
  switchLoss: number;
  pStringMax: number;
  qNomAh: number;
}

export const containerTemp = (tAmb: number, set: number, k: number) => set + k * (tAmb - set);

export const coldFactor = (tCell: number, slope: number) =>
  Math.min(1, Math.max(0.3, 1 - slope * Math.max(0, 25 - tCell)));

export const derate = (tMaxCell: number, tDerate: number, tMax: number) =>
  Math.min(1, Math.max(0, 1 - (tMaxCell - tDerate) / Math.max(tMax - tDerate, 1e-6)));

/** Bypass string: cells drop out as they empty; stops when active < nMin. Returns sum_i min(A_i, a*). */
export function bypassString(avail: ArrayLike<number>, off: number, n: number, nMin: number,
                             excluded?: ArrayLike<boolean>): { cellAh: number; cutoff: number } {
  const a: number[] = new Array(n);
  let eligible = 0;
  for (let j = 0; j < n; j++) {
    const ex = excluded ? excluded[off + j] : false;
    a[j] = ex ? 0 : avail[off + j];
    if (!ex) eligible++;
  }
  if (eligible < nMin) return { cellAh: 0, cutoff: 0 };
  const srt = a.slice().sort((x, y) => x - y);
  const cutoff = srt[n - nMin];
  let s = 0;
  for (let j = 0; j < n; j++) s += Math.min(a[j], cutoff);
  return { cellAh: s, cutoff };
}

export interface Deliverable {
  energyKwh: number;          // system
  powerKw: number;            // system
  stringEnergy: Float64Array;
  stringPower: Float64Array;
  cutoff: Float64Array;       // bypass cutoff per string (Ah)
  limiting: Int32Array;       // fixed: index of limiting cell per string
  hot: Uint8Array;            // per cell
}

/** Deliverable energy and power at a peak (same as physics.deliverable in Python). */
export function deliverable(qAh: ArrayLike<number>, tier: Tier, soc0: number, tCell: ArrayLike<number>,
                            chem: Chem, sys: SystemSpec, faulted?: ArrayLike<boolean>): Deliverable {
  const { nStrings: S, nSeries: N } = sys;
  const avail = new Float64Array(S * N);
  const hot = new Uint8Array(S * N);
  for (let i = 0; i < S * N; i++) {
    avail[i] = qAh[i] * soc0 * coldFactor(tCell[i], chem.coldSlope);
    hot[i] = tCell[i] > chem.tDerate ? 1 : 0;
  }
  const se = new Float64Array(S), sp = new Float64Array(S), cut = new Float64Array(S);
  const lim = new Int32Array(S);
  for (let s = 0; s < S; s++) {
    const off = s * N;
    if (tier === "fixed") {
      let mn = Infinity, mi = 0, tmax = -Infinity, anyFault = false;
      for (let j = 0; j < N; j++) {
        if (avail[off + j] < mn) { mn = avail[off + j]; mi = j; }
        if (tCell[off + j] > tmax) tmax = tCell[off + j];
        if (faulted && faulted[off + j]) anyFault = true;
      }
      const ah = anyFault ? 0 : mn;
      lim[s] = mi;
      se[s] = ah * chem.vNom * N / 1000 * sys.eta;
      sp[s] = ah > 0 ? sys.pStringMax * derate(tmax, chem.tDerate, chem.tMax) : 0;
    } else {
      const excl: boolean[] = new Array(S * N).fill(false);
      let nEx = 0;
      for (let j = 0; j < N; j++) {
        const e = hot[off + j] === 1 || (faulted ? !!faulted[off + j] : false);
        excl[off + j] = e;
        if (e) nEx++;
      }
      if (N - nEx < sys.nMin) {          // too many hot: keep them, derate instead
        for (let j = 0; j < N; j++) excl[off + j] = faulted ? !!faulted[off + j] : false;
      }
      const { cellAh, cutoff } = bypassString(avail, off, N, sys.nMin, excl);
      cut[s] = cutoff;
      let tmax = -Infinity;
      for (let j = 0; j < N; j++) if (!excl[off + j] && tCell[off + j] > tmax) tmax = tCell[off + j];
      se[s] = cellAh * chem.vNom / 1000 * sys.eta * (1 - sys.switchLoss);
      sp[s] = cutoff > 0 ? sys.pStringMax * derate(tmax, chem.tDerate, chem.tMax) : 0;
    }
  }
  let e = 0, p = 0;
  for (let s = 0; s < S; s++) { e += se[s]; p += sp[s]; }
  return { energyKwh: e, powerKw: p, stringEnergy: se, stringPower: sp, cutoff: cut, limiting: lim, hot };
}
