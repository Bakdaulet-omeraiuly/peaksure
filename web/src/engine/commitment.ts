// Commitment quantities, kept separate so the UI can never confuse power, energy, duration, age, year and HE.
//
// Measurement boundary: the engine's deliverable energy is AC-side, i.e. cell charge x nominal voltage
// x inverter efficiency (eta) x (1 - switch loss) for bypass strings. Rated energy is the model's nameplate
// (cell count x nominal Ah x nominal V), a DC quantity. Whether REON's published "up to 5 MWh" is DC
// nameplate or usable AC energy is UNKNOWN, so the nominal ratio below is only a DERIVED ratio.
import type { Decision } from "./decision";
import type { Belief } from "./belief";

export type Boundary = "AC (after inverter and switch losses)";
export const BOUNDARY: Boundary = "AC (after inverter and switch losses)";

export interface CommitmentSummary {
  ratedPowerKw: number;            // system rated power (model)
  ratedEnergyKwh: number;          // system rated energy, DC nameplate (model)
  nominalRatioH: number;           // DERIVED: ratedEnergy / ratedPower; not a guaranteed AC duration
  powerKw: number;                 // commitment power
  durationH: number;               // commitment window length
  energyKwh: number;               // commitment energy = power x duration
  startHe: number;                 // first hour-ending of the window (HE h = clock hour h-1:00 to h:00)
  endHe: number;                   // last hour-ending of the window
  believedP5Kwh: number;           // operator's belief (decision-time), AC boundary
  withinRated: boolean;            // energy <= rated DC nameplate x eta (upper bound on AC energy)
  withinBelief: boolean;           // energy <= believed P5 (what the rule promised itself)
  status: "feasible" | "no-commitment" | "exceeds-belief" | "exceeds-rated";
}

export const commitmentEnergyKwh = (powerKw: number, durationH: number) => powerKw * durationH;

/** Hour-ending h covers clock time (h-1):00 to h:00. */
export const heClock = (he: number) => `${String(he - 1).padStart(2, "0")}:00–${String(he % 24).padStart(2, "0")}:00`;

export function summarizeCommitment(d: Decision, belief: Belief, ratedPowerKw: number, ratedEnergyKwh: number,
                                    eta: number): CommitmentSummary {
  const energyKwh = commitmentEnergyKwh(d.powerKw, d.windowH);
  const tol = 1e-6 * Math.max(1, energyKwh);
  const withinRated = energyKwh <= ratedEnergyKwh * eta + tol && d.powerKw <= ratedPowerKw + 1e-6;
  const withinBelief = energyKwh <= belief.p5 + tol;
  const status = d.powerKw <= 0 ? "no-commitment" : !withinRated ? "exceeds-rated" : !withinBelief ? "exceeds-belief" : "feasible";
  return { ratedPowerKw, ratedEnergyKwh, nominalRatioH: ratedEnergyKwh / ratedPowerKw, powerKw: d.powerKw,
           durationH: d.windowH, energyKwh, startHe: d.startHe, endHe: d.startHe + d.windowH - 1,
           believedP5Kwh: belief.p5, withinRated, withinBelief, status };
}

/** Plain-language note when the commitment window differs from the system's nominal ratio. */
export function durationNote(s: CommitmentSummary): string | null {
  if (s.powerKw <= 0) return null;
  if (Math.abs(s.durationH - s.nominalRatioH) < 1e-9 && Math.abs(s.powerKw - s.ratedPowerKw) < 1e-6) return null;
  return `The system's nominal ratio is ${s.nominalRatioH.toFixed(0)} h (rated energy ÷ rated power). The operator chose a ` +
         `${s.durationH} h window at ${(s.powerKw / 1000).toFixed(2)} MW = ${(s.energyKwh / 1000).toFixed(2)} MWh, ` +
         `which its belief says the battery can deliver. Window length is a decision, not the battery's size.`;
}
