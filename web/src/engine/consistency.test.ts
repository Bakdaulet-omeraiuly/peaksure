// Consistency checks requested in the accuracy/transparency audit:
// product separation, commitment energy, feasibility, unit/time confusion, 3D states from engine output,
// honest zero differences, N_min / bypass constraints.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Constants, Life, PeakEvent } from "./data";
import { buildScenario } from "./scenario";
import { cellState, compareRuns, keyMoments, runStats } from "./cellview";
import { commitmentEnergyKwh, durationNote, heClock, summarizeCommitment } from "./commitment";
import { ProductsFile } from "./products";

const root = path.resolve(__dirname, "../../public/data");
const load = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const C = load<Constants>("constants.json");
const events = load<PeakEvent[]>("events.json");
const P = load<ProductsFile>("products.json");
const life = (d: string) => load<Life>(`life_${d}_s0.json`);
const ev25 = events.find((e) => e.is_annual && e.year === 2025)!;
const knobs = { kHvac: C.k_hvac, sigmaT: C.sigma_t_cell, probeBudget: 0, reportBias: 0 };

describe("product profiles (generated from peaksure/products.py)", () => {
  const ces = P.products.find((p) => p.key === "CES")!, ebs = P.products.find((p) => p.key === "EBS_NA")!;
  it("CES and EBS are separate profiles", () => {
    expect(ces).toBeDefined(); expect(ebs).toBeDefined();
    expect(ces.specs.rated_power_kw.value).toBe(2500);
    expect(ebs.specs.rated_power_kw.value).toBe(30);
  });
  it("EBS-only specs are not applied to CES", () => {
    for (const k of ["chemistry", "cells_per_string", "n_min", "dc_window_v", "switch_r_on", "round_trip_eff", "parallel_columns"])
      expect(ces.specs[k].status, k).toBe("UNKNOWN");
    expect(ces.specs.cycle_life).toBeUndefined();
    expect(ces.specs.cell_level_bypass.value).toBe(false);
  });
  it("model assumptions are labelled, not presented as REON specs", () => {
    expect(P.model.specs.cells_per_string.status).toBe("ASSUMED");
    expect(P.model.specs.cells_per_string.value).toBe(C.n_series);
    expect(P.model.specs.parallel_columns.value).toBe(C.n_strings);
    expect(P.model.specs.n_min.value).toBe(Math.round(C.n_series * (1 - C.headroom)));
    expect(C.flags.p_max_kw[0]).toBe("ASSUMED");
    expect(C.flags.e_nom_kwh[0]).toBe("ASSUMED");
    for (const p of [...P.products, P.model]) for (const s of Object.values(p.specs)) expect(P.statuses).toContain(s.status);
  });
});

describe("commitment quantities", () => {
  it("energy = power × duration", () => {
    expect(commitmentEnergyKwh(2500, 3)).toBe(7500);
    expect(commitmentEnergyKwh(2093.75, 2)).toBeCloseTo(4187.5);
  });
  const belief = { samples: new Float64Array([9000]), p5: 9000, p50: 9000, p95: 9000, pAvail: 2500 };
  it("2.5 MW for 3 h is infeasible on a 5 MWh profile, even with an optimistic belief", () => {
    const s = summarizeCommitment({ startHe: 16, windowH: 3, powerKw: 2500, expKw: 0 }, belief, 2500, 5000, 0.96);
    expect(s.energyKwh).toBe(7500);
    expect(s.status).toBe("exceeds-rated");
  });
  it("commitment above the operator's own P5 is flagged", () => {
    const s = summarizeCommitment({ startHe: 18, windowH: 1, powerKw: 2500, expKw: 0 }, { ...belief, p5: 2000 }, 2500, 5000, 0.96);
    expect(s.status).toBe("exceeds-belief");
  });
  it("nominal ratio is rated energy / rated power and window length is reported separately", () => {
    const s = summarizeCommitment({ startHe: 16, windowH: 3, powerKw: 2500, expKw: 0 }, belief, 2500, 10000, 0.96);
    expect(s.nominalRatioH).toBe(4);
    expect(s.durationH).toBe(3);
    expect(s.status).toBe("feasible");
    expect(durationNote(s)).toMatch(/Window length is a decision/);
  });
  it("HE is a clock hour, not a duration", () => {
    expect(heClock(18)).toBe("17:00–18:00");
    expect(heClock(24)).toBe("23:00–00:00");
  });
});

describe("live scenarios: every commitment is feasible and quantities are not confused", () => {
  for (const d of ["1h", "2h", "4h"]) for (const age of [1, 9, 15]) {
    it(`${d}, age ${age}`, () => {
      const sc = buildScenario(C, life(d), ev25, age, knobs);
      expect(sc.calYear).toBe(C.start_year + age - 1);       // age (years) and calendar year are distinct
      expect(sc.eNom).toBe(C.durations[d]);
      for (const k of ["A", "B", "C"] as const) {
        const cm = sc.ops[k].commitment;
        expect(cm.energyKwh).toBeCloseTo(sc.ops[k].decision.powerKw * sc.ops[k].decision.windowH, 6);
        expect(["feasible", "no-commitment"]).toContain(cm.status);
        expect(cm.ratedEnergyKwh).toBe(sc.eNom);
        expect(C.he_grid).toContain(cm.startHe);              // HE on the clock grid
        expect(cm.durationH).toBeGreaterThanOrEqual(1);
        expect(cm.durationH).toBeLessThanOrEqual(6);
      }
    });
  }
});

describe("3D states come from the engine", () => {
  const sc = buildScenario(C, life("2h"), ev25, 9, knobs);
  const N = C.n_series, S = C.n_strings, SN = N * S;
  for (const [k, view] of [["A", "drain"], ["B", "drain"], ["C", "peak"]] as const) {
    it(`${k} ${view}: bypassed cells = inactive cells on running strings; fixed strings never bypass`, () => {
      const op = sc.ops[k], run = view === "drain" ? op.drain! : op.run;
      for (let f = 0; f < run.nFrames; f += 7) {
        let shown = 0, engine = 0;
        for (let i = 0; i < SN; i++) {
          const st = cellState(run, op.tier, f, i, N, S);
          if (st === "bypassed") shown++;
          if (f > 0 && !run.active[f * SN + i] && run.stringsOnline[f * S + Math.floor(i / N)]) engine++;
          if (op.tier === "fixed") expect(st).not.toBe("bypassed");
        }
        expect(shown).toBe(engine);
      }
    });
  }
  it("bypass strings respect N_min every minute", () => {
    const run = sc.ops.B.drain!;
    for (let f = 0; f < run.nFrames; f++) for (let s = 0; s < S; s++) {
      if (!run.stringsOnline[f * S + s]) continue;
      let n = 0;
      for (let j = 0; j < N; j++) n += run.active[f * SN + s * N + j];
      expect(n).toBeGreaterThanOrEqual(sc.sys.nMin);
    }
  });
  it("no cell is ever drawn below empty (stranded energy matches the analytic drain)", () => {
    for (const k of ["A", "B"] as const) {
      const dr = sc.ops[k].drain!;
      for (let i = 0; i < dr.soc.length; i++) expect(dr.soc[i]).toBeGreaterThanOrEqual(-1e-6);
    }
    const end = (k: "A" | "B") => runStats(sc.ops[k].drain!, sc.ops[k].tier, 1e9, C.v_nom, N, S).strandedKwh;
    // analytic stranded charge: fixed stops at its emptiest cell; bypass stops when fewer than N_min remain
    const analytic = (k: "A" | "B") => {
      const full = sc.ops[k].drain!.fullAh;
      let ah = 0;
      for (let s = 0; s < S; s++) {
        const a = Array.from(full.slice(s * N, (s + 1) * N)).sort((x, y) => x - y);
        const stop = k === "A" ? a[0] : a[N - sc.sys.nMin];
        for (const v of a) ah += Math.max(0, v - stop);
      }
      return (ah * C.v_nom) / 1000;
    };
    for (const k of ["A", "B"] as const) expect(Math.abs(end(k) - analytic(k)) / analytic(k)).toBeLessThan(0.02);
    expect(end("A")).toBeGreaterThan(end("B"));            // bypass strands less, it does not create energy
    expect(sc.ops.B.drain!.energyKwh).toBeLessThan(sc.eNom);
  });
  it("key moments come from engine events", () => {
    const km = keyMoments(sc.ops.A.drain!, sc.ops.B.drain!);
    expect(km.limiting).toBe(sc.ops.A.drain!.events.find((e) => e.kind === "string-stop" || e.kind === "derate")!.minute);
    expect(km.bypass).toBe(sc.ops.B.drain!.events.find((e) => e.kind === "empty" || e.kind === "hot")!.minute);
  });
});

describe("honest differences", () => {
  it("identical runs report zero, negligible difference", () => {
    const sc = buildScenario(C, life("2h"), ev25, 9, knobs);
    const r = compareRuns(sc.ops.B.run, "bypass", sc.ops.B.run, "bypass", 18 * 60, C.v_nom, C.n_series, C.n_strings);
    expect(r.cellsDiffering).toBe(0);
    expect(r.negligible).toBe(true);
    expect(r.deliveredDiffKwh).toBe(0);
  });
  it("same-cells mode gives A and B identical cells, so pre-peak difference is zero", () => {
    const sc = buildScenario(C, life("2h"), ev25, 9, { ...knobs, sameCells: true });
    expect(Array.from(sc.ops.A.qRel)).toEqual(Array.from(sc.ops.B.qRel));
    const r = compareRuns(sc.ops.B.drain!, "bypass", sc.ops.A.drain!, "fixed", 0, C.v_nom, C.n_series, C.n_strings);
    expect(r.cellsDiffering).toBe(0);
  });
  it("2-h base case: A, B and C deliver the same at the peak (no invented advantage)", () => {
    const sc = buildScenario(C, life("2h"), ev25, 9, knobs);
    const end = 24 * 60 - 1;
    const r = compareRuns(sc.ops.B.run, "bypass", sc.ops.A.run, "fixed", end, C.v_nom, C.n_series, C.n_strings);
    expect(Math.abs(r.deliveredDiffKwh)).toBeLessThan(0.01 * sc.ops.A.run.energyKwh);
  });
});
