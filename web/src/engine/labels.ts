/** Names for the modeled battery cases, kept consistent across views. */
export const BATTERY_NAMES = {
  A: "A · Conventional battery",
  B: "B · REON EBS model (bypass)",
  C: "C · REON EBS model + PeakSure",
} as const;

export const BATTERY_SHORT = {
  A: "Conventional battery",
  B: "REON EBS model",
  C: "REON EBS + PeakSure",
} as const;
