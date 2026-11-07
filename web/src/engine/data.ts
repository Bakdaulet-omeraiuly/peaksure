// Data exported by tools/export_web.py (Python model) and its decoding.
export interface Constants {
  p_max_kw: number; n_strings: number; n_series: number; headroom: number; eta: number; switch_loss: number;
  v_nom: number; cold_slope: number; t_charge_min: number; t_derate: number; t_max: number; t_hvac_set: number;
  k_hvac: number; sigma_t_cell: number; load_heating_c: number; forecast_temp_sd: number; sigma_meas: number;
  sigma_pack_test: number; sigma_probe: number; alpha: number; eol_retention: number; start_year: number;
  rns_2026: number; rns_increments: number[]; fca_kw_month: number; nominal_fade_month: number; years: number;
  he_grid: number[]; durations: Record<string, number>; seeds: number[]; chemistry: string;
  flags: Record<string, [string, string]>; towns: Record<string, { customers: number; peak_mw: number; src: string }>;
}

export interface PeakEvent {
  date: string; year: number; month: number; he: number; t_amb_c: number; is_annual: boolean;
  system_mw: number; load: number[]; temp_c: number[]; p_hour: number[];
}

export interface YearState { soh: string; twin_mean: string; twin_sd: string; aug_kwh: number }
export interface Life { duration: string; seed: number; tiers: { fixed: YearState[]; bypass: YearState[] }; t_off: string; r_rel: string }

export function decodeU16(b64: string, scale: number): Float64Array {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const n = bin.length / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) / scale;
  return out;
}

export function decodeI16(b64: string, scale: number): Float64Array {
  const u = decodeU16(b64, 1);
  return u.map((v) => (v >= 32768 ? v - 65536 : v) / scale);
}

const cache = new Map<string, Promise<unknown>>();
export function fetchJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }));
  return cache.get(path) as Promise<T>;
}

export const rnsRate = (c: Constants, year: number) =>
  c.rns_2026 + c.rns_increments.reduce((acc, inc, i) => acc + (year >= 2027 + i ? inc : 0), 0);
