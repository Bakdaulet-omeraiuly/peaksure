/** Names for the modeled battery cases, kept consistent across views.
 *  "REON-style": PeakSure's schematic model of per-cell bypass. REON's EBS carries the cell-level BMS, but its
 *  internal topology (cells per string, columns, N_min, switch R_on) is not public, so B/C are not an EBS layout. */
export const BATTERY_NAMES = {
  A: "A · Conventional battery",
  B: "B · REON-style bypass model",
  C: "C · REON-style bypass + PeakSure",
} as const;

export const BATTERY_SHORT = {
  A: "Conventional battery",
  B: "REON-style bypass",
  C: "REON-style + PeakSure",
} as const;

export const BATTERY_SUB = {
  A: "fixed series strings · first empty cell stops its string · annual pack test · full-power rule",
  B: "per-cell bypass (schematic) · string runs while ≥ N_min cells · annual pack test · full-power rule",
  C: "per-cell bypass (schematic) · per-cell twin · 95%-confidence commitment",
} as const;
