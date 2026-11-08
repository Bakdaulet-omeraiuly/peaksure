/** Names for the modeled battery cases, kept consistent across views.
 *  B/C model REON EBS cell-level bypass. EBS internals (cells per string, columns, N_min, switch R_on) are not
 *  public, so the cell layout is a simulation abstraction, not an EBS hardware layout. */
export const BATTERY_NAMES = {
  A: "A · Conventional",
  B: "B · REON EBS",
  C: "C · REON EBS + PeakSure",
} as const;

export const BATTERY_SHORT = {
  A: "Conventional",
  B: "REON EBS",
  C: "REON EBS + PeakSure",
} as const;

export const BATTERY_SUB = {
  A: "fixed strings · pack test · full power",
  B: "cell bypass · pack test · full power",
  C: "cell bypass · cell twin · 95% confidence",
} as const;
