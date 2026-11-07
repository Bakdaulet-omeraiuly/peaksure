// Peak commitment (port of peaksure/decision.py): window start (hour-ending), length, power.
export interface Decision { startHe: number; windowH: number; powerKw: number; expKw: number }

const W_MAX = 6, N_P = 80;

function probAtLeast(sorted: Float64Array, x: number) {
  // P(D >= x) with searchsorted 'left'
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < x) lo = m + 1; else hi = m; }
  return 1 - lo / sorted.length;
}

export function optimize(dSamples: ArrayLike<number>, pAvail: number, pHour: number[], heGrid: number[],
                         alpha = 0.05): Decision {
  const d = Float64Array.from(dSamples).sort();
  let best: Decision = { startHe: heGrid[0], windowH: 1, powerKw: 0, expKw: -1 };
  for (let w = 1; w <= W_MAX; w++) {
    for (let pi = 1; pi <= N_P; pi++) {
      const P = (pAvail * pi) / N_P;
      if (probAtLeast(d, P * w) < 1 - alpha) continue;       // deliverability chance constraint
      const pk: number[] = [];
      for (let k = 1; k <= w; k++) pk.push(probAtLeast(d, P * k));
      for (let si = 0; si + w <= heGrid.length; si++) {
        let u = 0;
        for (let k = 0; k < w; k++) u += pHour[si + k] * pk[k];
        u *= P;
        if (u > best.expKw) best = { startHe: heGrid[si], windowH: w, powerKw: P, expKw: u };
      }
    }
  }
  if (best.expKw < 0) best = { startHe: heGrid[argmax(pHour)], windowH: 1, powerKw: 0, expKw: 0 };
  return best;
}

export function fixedRule(dP5: number, pAvail: number, pHour: number[], heGrid: number[]): Decision {
  if (pAvail <= 0 || dP5 <= 0) return { startHe: heGrid[argmax(pHour)], windowH: 1, powerKw: 0, expKw: 0 };
  const w = Math.min(W_MAX, Math.max(1, Math.floor(dP5 / pAvail)));
  const p = Math.min(pAvail, dP5 / w);
  const mode = argmax(pHour);
  const si = Math.min(Math.max(mode - Math.floor((w - 1) / 2), 0), heGrid.length - w);
  let cov = 0;
  for (let k = 0; k < w; k++) cov += pHour[si + k];
  return { startHe: heGrid[si], windowH: w, powerKw: p, expKw: p * cov };
}

export function argmax(a: number[]) {
  let m = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[m]) m = i;
  return m;
}
