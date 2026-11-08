// Facility interval-load data contract (peaksure-facility-load/0.1), validation and the advisory demand-target
// recommendation. Port of peaksure/facility.py, checked against __fixtures__/python_facility.json.
export const CONTRACT = "peaksure-facility-load/0.1";
export const G2 = { usdPerKwMonth: 15.24, maxKw: 200, status: "CONFIRMED",
  source: "National Grid MA G-2 delivery demand charge, M.D.P.U. No. 1-26-I, effective 2026-10-01; billed on the greatest 15-minute demand" } as const;

export interface Point { t: Date; kw: number }
export interface Report { ok: boolean; errors: string[]; warnings: string[]; intervalMin: number | null; rows: number; start: string | null; end: string | null }

/** Site-local ISO text (the contract's timestamps have no time zone; never shift them to UTC for display). */
export const localIso = (t: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
};

const parseTime = (s: string) => {
  const t = new Date(s.trim());
  return Number.isNaN(t.getTime()) ? null : t;
};

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
  return { header: (lines[0] ?? "").split(",").map((h) => h.trim()), rows: lines.slice(1).map((l) => l.split(",")) };
}

export function validate(text: string, now?: Date, staleDays = 35): { report: Report; series: Point[] | null } {
  const r: Report = { ok: false, errors: [], warnings: [], intervalMin: null, rows: 0, start: null, end: null };
  const { header, rows } = parseCsv(text);
  if (header.slice(0, 2).map((h) => h.toLowerCase()).join(",") !== "timestamp,kw") {
    r.errors.push(`header must be 'timestamp,kw' (${CONTRACT}); got ${header.slice(0, 3).join(",")}`);
    return { report: r, series: null };
  }
  let badT = 0, badK = 0;
  const pts: Point[] = [];
  for (const row of rows) {
    const t = parseTime(row[0] ?? "");
    const raw = (row[1] ?? "").trim();
    const kw = raw === "" ? NaN : Number(raw);
    if (!t) badT++;
    if (!Number.isFinite(kw)) badK++;
    if (t && Number.isFinite(kw)) pts.push({ t, kw });
  }
  if (badT) r.errors.push(`${badT} rows have an unreadable timestamp`);
  if (badK) r.errors.push(`${badK} rows have a missing or non-numeric kW value`);
  r.rows = pts.length;
  if (pts.length < 4) { r.errors.push("fewer than 4 valid rows"); return { report: r, series: null }; }
  pts.sort((a, b) => a.t.getTime() - b.t.getTime());
  const seen = new Set<number>();
  let dup = 0;
  const s: Point[] = [];
  for (const p of pts) { if (seen.has(p.t.getTime())) dup++; else { seen.add(p.t.getTime()); s.push(p); } }
  if (dup) r.errors.push(`${dup} duplicate timestamps`);
  const neg = s.filter((p) => p.kw < 0).length;
  if (neg) r.errors.push(`${neg} negative kW values (export / net metering is outside this contract)`);
  const steps = s.slice(1).map((p, i) => (p.t.getTime() - s[i].t.getTime()) / 60000);
  const counts = new Map<number, number>();
  for (const x of steps) counts.set(x, (counts.get(x) ?? 0) + 1);
  const mode = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  r.intervalMin = mode;
  if (mode !== 15 && mode !== 60) r.errors.push(`interval is ${mode} min; the contract allows 15 or 60`);
  const gaps = steps.filter((x) => x > mode * 1.01).length;
  if (gaps) r.warnings.push(`${gaps} gaps in the interval sequence`);
  if (mode === 60) r.warnings.push("hourly data: the G-2 bill uses the greatest 15-minute demand, so billed peaks can be higher");
  const sorted = s.map((p) => p.kw).sort((a, b) => a - b);
  const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const mx = sorted[sorted.length - 1];
  if (med > 5000) r.errors.push(`median ${Math.round(med).toLocaleString()} 'kW' looks like watts; convert to kW`);
  else if (mx < 1) r.errors.push(`maximum ${mx.toFixed(3)} 'kW' looks like MW; convert to kW`);
  else if (mx > G2.maxKw) r.warnings.push(`peak ${Math.round(mx)} kW exceeds the 200 kW G-2 limit; the confirmed tariff may not apply`);
  r.start = localIso(s[0].t);
  r.end = localIso(s[s.length - 1].t);
  if (now) {
    const days = Math.floor((now.getTime() - s[s.length - 1].t.getTime()) / 86400000);
    if (days > staleDays) r.warnings.push(`data ends ${days} days before the analysis date (stale)`);
  }
  r.ok = r.errors.length === 0;
  return { report: r, series: r.ok ? s : null };
}

/** The local calendar day containing the maximum (the day that sets the monthly bill). */
export function peakDay(s: Point[]): Point[] {
  let m = s[0];
  for (const p of s) if (p.kw > m.kw) m = p;
  const d0 = new Date(m.t.getFullYear(), m.t.getMonth(), m.t.getDate()).getTime();
  return s.filter((p) => p.t.getTime() >= d0 && p.t.getTime() < d0 + 86400000);
}

export interface Target { targetKw: number; reductionKw: number; peakKw: number; energyKwh: number; maxDischargeKw: number;
  hours: number; firstHe: number | null; lastHe: number | null; binding: "energy" | "power" | "none"; dischargeKw: number[] }

/** Lowest demand target T with sum((L-T)+)*dt <= energy and max(L-T) <= power. Same bisection as Python. */
export function demandTarget(load: number[], dtH: number, energyKwh: number, powerKw: number, tol = 1e-6): Target {
  const peak = Math.max(...load);
  const need = (t: number) => load.reduce((a, l) => a + Math.max(0, l - t), 0) * dtH;
  let lo = Math.max(0, peak - powerKw), hi = peak, t: number, binding: Target["binding"];
  if (energyKwh <= 0 || powerKw <= 0) return { targetKw: peak, reductionKw: 0, peakKw: peak, energyKwh: 0, maxDischargeKw: 0, hours: 0, firstHe: null, lastHe: null, binding: "none", dischargeKw: load.map(() => 0) };
  if (need(lo) <= energyKwh + tol) { t = lo; binding = "power"; }
  else {
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (need(mid) <= energyKwh) hi = mid; else lo = mid; }
    t = hi; binding = "energy";
  }
  const d = load.map((l) => Math.max(0, l - t));
  const idx = d.map((v, i) => (v > 1e-9 ? i : -1)).filter((i) => i >= 0);
  const perHour = Math.round(1 / dtH);
  const he = (i: number) => Math.floor(i / perHour) + 1;
  return { targetKw: t, reductionKw: peak - t, peakKw: peak, energyKwh: d.reduce((a, v) => a + v, 0) * dtH,
    maxDischargeKw: Math.max(...d), hours: idx.length * dtH, firstHe: idx.length ? he(idx[0]) : null,
    lastHe: idx.length ? he(idx[idx.length - 1]) : null, binding, dischargeKw: d };
}

/** Linear interpolation on an exported energy-vs-power curve (clamped). */
export function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}

/**
 * Advisory recommendation for one hardware: the energy limit is the belief P5 at the rated power (conservative,
 * since the dispatch never exceeds rated power). Truth (simulated plant) is NOT an input here.
 */
export function recommend(day: number[], dtH: number, ratedKw: number, beliefKw: number[], beliefP5: number[]) {
  const e5 = interp(beliefKw, beliefP5, ratedKw);
  return { energyLimitKwh: e5, target: demandTarget(day, dtH, e5, ratedKw) };
}

/** After the event: could the simulated plant deliver the dispatch? (energy at the dispatch's peak power). */
export function plantCheck(t: Target, plantKw: number[], plantKwh: number[]) {
  const avail = interp(plantKw, plantKwh, t.maxDischargeKw || plantKw[0]);
  return { availableKwh: avail, delivered: t.energyKwh <= avail + 1e-6, marginKwh: avail - t.energyKwh };
}
