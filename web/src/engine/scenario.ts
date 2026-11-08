// Assemble one live scenario: a real ISO-NE peak, a battery age, and three modeled operators.
//   A Conventional battery: fixed strings + annual pack test + full-power rule.
//   B REON-style bypass model (schematic; EBS topology unknown): bypass + annual pack test + full-power rule (assumed policy).
//   C REON EBS bypass + PeakSure: per-cell estimator constrained by an independent annual pack-test
//     safety envelope + 95%-confidence commitment (+ optional VoI probes).
import { Constants, Life, PeakEvent, decodeI16, decodeU16, rnsRate } from "./data";
import { Chem, SystemSpec, Tier, containerTemp, deliverable } from "./physics";
import { Belief, Thermal, cellTemps, lowerEnvelope, packBelief, twinBelief } from "./belief";
import { Decision, fixedRule, optimize } from "./decision";
import { DischargeResult, discharge } from "./discharge";
import { Probe, runVoi } from "./voi";
import { BATTERY_NAMES } from "./labels";
import { CommitmentSummary, summarizeCommitment } from "./commitment";

export interface Knobs {
  kHvac: number; sigmaT: number; probeBudget: number; reportBias: number; switchLoss?: number;
  eta?: number; headroom?: number;
  /** true: A uses the REON-style plant's cells at this age (pure hardware comparison on identical cells).
   *  false (default): each hardware uses its own ageing path from the same year-0 cells and random draws. */
  sameCells?: boolean;
}

export interface OperatorResult {
  key: "A" | "B" | "C";
  tier: Tier;
  label: string;
  qRel: Float64Array;              // true capacity / nominal
  belief: Belief;
  rawTwinBelief?: Belief;
  beliefBeforeProbes?: Belief;
  decision: Decision;
  truthKwh: number;
  truthPowerKw: number;
  run: DischargeResult;
  shavedKw: number;
  valueUsd: number;
  probes: Probe[];
  twinMean?: Float64Array;
  twinSd?: Float64Array;
  limiting?: Int32Array;
  drain?: DischargeResult;         // full-power discharge from full to cut-off (hardware comparison)
  cellsReplaced: number;           // cumulative cells replaced by annual augmentation up to this age
  commitment: CommitmentSummary;   // power, window, energy = power x window, feasibility at the AC boundary
}

export interface Scenario {
  event: PeakEvent; age: number; calYear: number; durationKey: string; eNom: number; qNom: number;
  sys: SystemSpec; chem: Chem; tCell: Float64Array; tContainer: number; rateUsdPerKw: number; sameCells: boolean;
  ops: { A: OperatorResult; B: OperatorResult; C: OperatorResult };
}

export function validateModelInputs(c: Constants, life: Life, knobs: Knobs): string | null {
  const N = c.n_series;
  const nMin = Math.round(N * (1 - (knobs.headroom ?? c.headroom)));
  if (!Number.isFinite(c.durations[life.duration]) || c.durations[life.duration] <= 0)
    return `No modeled energy rating for ${life.duration}.`;
  if (!Number.isInteger(N) || N < 1 || !Number.isInteger(c.n_strings) || c.n_strings < 1 || nMin < 1 || nMin > N)
    return "Invalid modeled cell count or minimum active-cell count (N_min).";
  if (c.p_max_kw <= 0 || (knobs.eta ?? c.eta) <= 0 || (knobs.eta ?? c.eta) > 1 || (knobs.switchLoss ?? c.switch_loss) < 0 || (knobs.switchLoss ?? c.switch_loss) >= 1)
    return "Invalid modeled power, cell-to-AC efficiency, or switch loss.";
  return null;
}

export function buildScenario(c: Constants, life: Life, ev: PeakEvent, age: number, knobs: Knobs): Scenario {
  const invalid = validateModelInputs(c, life, knobs);
  if (invalid) throw new Error(invalid);
  const eNom = c.durations[life.duration];
  const S = c.n_strings, N = c.n_series;
  const qNom = (eNom * 1000) / (S * N * c.v_nom);
  const sys: SystemSpec = { nStrings: S, nSeries: N, nMin: Math.round(N * (1 - (knobs.headroom ?? c.headroom))), eta: knobs.eta ?? c.eta,
                            switchLoss: knobs.switchLoss ?? c.switch_loss, pStringMax: c.p_max_kw / S, qNomAh: qNom };
  const chem: Chem = { vNom: c.v_nom, coldSlope: c.cold_slope, tChargeMin: c.t_charge_min, tDerate: c.t_derate, tMax: c.t_max };
  const tOff0 = decodeI16(life.t_off, 100);
  const tOff = tOff0.map((v) => v * (knobs.sigmaT / c.sigma_t_cell));
  const rRel = decodeU16(life.r_rel, 20000);
  const th: Thermal = { tSet: c.t_hvac_set, kHvac: knobs.kHvac, tOff, loadHeatingC: 0, forecastSd: c.forecast_temp_sd };
  const tBase = cellTemps(ev.t_amb_c, th);                   // before load heating (discharge adds it)
  const thBelief: Thermal = { ...th, loadHeatingC: c.load_heating_c };
  const tCell = cellTemps(ev.t_amb_c, thBelief);              // planning temperature incl. load heating
  const tCont = containerTemp(ev.t_amb_c, c.t_hvac_set, knobs.kHvac);
  const soc0 = tCont >= c.t_charge_min ? 1 : 0.7;
  const calYear = c.start_year + age - 1;
  const rate = rnsRate(c, calYear) / 12 + (ev.is_annual ? c.fca_kw_month * 12 : 0);
  const yi = Math.min(age - 1, life.tiers.fixed.length - 1);
  const seedBase = life.seed * 1000 + age * 37 + ev.month;

  const mk = (key: "A" | "B" | "C"): OperatorResult => {
    const tier: Tier = key === "A" ? "fixed" : "bypass";
    const st = life.tiers[tier][yi];
    const qRel = decodeU16((knobs.sameCells ? life.tiers.bypass[yi] : st).soh, 20000);
    const q = qRel.map((v) => v * qNom);
    const truth = deliverable(q, tier, soc0, tCell, chem, sys);
    let belief: Belief, rawTwinBelief: Belief | undefined, before: Belief | undefined, decision: Decision, probes: Probe[] = [];
    let twinMean: Float64Array | undefined, twinSd: Float64Array | undefined;
    if (key !== "C") {
      const ref = deliverable(q, tier, 1, new Float64Array(q.length).fill(25), chem, sys).energyKwh;
      belief = packBelief(ref, ev.month - 1, c.nominal_fade_month, c.sigma_pack_test, ev.t_amb_c, thBelief, chem, sys, seedBase);
      decision = fixedRule(belief.p5, belief.pAvail, ev.p_hour, c.he_grid);
    } else {
      twinMean = decodeU16(st.twin_mean, 20000);
      twinSd = decodeU16(st.twin_sd, 100000);
      rawTwinBelief = twinBelief(twinMean, twinSd, qNom, tier, ev.t_amb_c, thBelief, chem, sys, seedBase, 128, knobs.reportBias);
      const ref = deliverable(q, tier, 1, new Float64Array(q.length).fill(25), chem, sys).energyKwh;
      const independentPack = packBelief(ref, ev.month - 1, c.nominal_fade_month, c.sigma_pack_test,
        ev.t_amb_c, thBelief, chem, sys, seedBase + 101);
      belief = lowerEnvelope(rawTwinBelief, independentPack);
      decision = optimize(belief.samples, belief.pAvail, ev.p_hour, c.he_grid, c.alpha);
      if (knobs.probeBudget > 0) {
        before = belief;
        const v = runVoi({ mean: twinMean.map((m) => m * (1 + knobs.reportBias)), sd: twinSd, qTrueRel: qRel, qNom, tier, soc0,
                           tCell, chem, sys, dec: decision, pHour: ev.p_hour, heGrid: c.he_grid, pAvail: belief.pAvail,
                           alpha: c.alpha, sigmaProbe: c.sigma_probe, budget: knobs.probeBudget, seed: seedBase,
                           bias: knobs.reportBias });
        probes = v.probes;
        if (probes.length) {
          twinMean = v.mean.map((m) => m / (1 + knobs.reportBias));
          twinSd = v.sd;
          rawTwinBelief = twinBelief(twinMean, twinSd, qNom, tier, ev.t_amb_c, thBelief, chem, sys, seedBase, 128, knobs.reportBias);
          belief = lowerEnvelope(rawTwinBelief, independentPack);
          decision = optimize(belief.samples, belief.pAvail, ev.p_hour, c.he_grid, c.alpha);
        }
      }
    }
    const run = discharge({ qAh: q, tBase, rRel, soc0, tier, chem, sys, decision, peakHe: ev.he, loadHeatingC: c.load_heating_c });
    // Drain test: same cells, same day temperatures, full charge, full rated power until every string stops.
    const drainH = Math.min(23, Math.ceil(eNom / c.p_max_kw) + 2);
    const drain = key === "C" ? undefined : discharge({ qAh: q, tBase, rRel, soc0: 1, tier, chem, sys,
      decision: { startHe: 1, windowH: drainH, powerKw: c.p_max_kw, expKw: 0 }, peakHe: 1, loadHeatingC: c.load_heating_c });
    const cellKwh = (qNom * c.v_nom) / 1000;
    let augKwh = 0;
    const hist: Tier = knobs.sameCells ? "bypass" : tier;      // cells (and their replacement history) actually shown
    for (let y = 0; y <= yi; y++) augKwh += life.tiers[hist][y].aug_kwh;
    const cellsReplaced = Math.round(augKwh / cellKwh);
    const inWindow = ev.he >= decision.startHe && ev.he < decision.startHe + decision.windowH;
    const shaved = inWindow ? run.peakHourAvgKw : 0;
    return { key, tier, label: BATTERY_NAMES[key], qRel, belief, rawTwinBelief, beforeProbes: undefined,
             beliefBeforeProbes: before, decision, truthKwh: truth.energyKwh, truthPowerKw: truth.powerKw, run,
             shavedKw: shaved, valueUsd: shaved * rate, probes, twinMean, twinSd, limiting: truth.limiting, drain, cellsReplaced,
             commitment: summarizeCommitment(decision, belief, c.p_max_kw, eNom, sys.eta) } as OperatorResult;
  };

  return { event: ev, age, calYear, durationKey: life.duration, eNom, qNom, sys, chem, tCell, tContainer: tCont,
           rateUsdPerKw: rate, sameCells: !!knobs.sameCells, ops: (() => { const A = mk("A"), B = mk("B"), C = mk("C"); C.drain = B.drain; return { A, B, C }; })() };
}
