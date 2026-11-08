// EBS scenario checks: separation from CES, honest labels, consistent quantities,
// 3D states read from simulation frames, Python/TypeScript agreement on exported commitments.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ProductsFile } from "./products";
import { EbsScenarioFile, cellStates, countStates, decode, diffMask, frameAt, stages, summary } from "./ebsScenario";
import { summarizeCommitment } from "./commitment";

const root = path.resolve(__dirname, "../../public/data");
const P: ProductsFile = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));
const E: EbsScenarioFile = JSON.parse(fs.readFileSync(path.join(root, "ebs_scenario.json"), "utf8"));
const prod = (k: string) => P.products.find((p) => p.key === k)!;

describe("EBS product evidence", () => {
  it("EBS is a separate profile from CES", () => {
    expect(prod("EBS_NA").specs.rated_power_kw.value).toBe(30);
    expect(prod("CES").specs.rated_power_kw.value).toBe(2500);
    expect(E.rated_kw).toBe(30);
    expect(E.rated_kwh).toBe(60);
  });
  it("Na+ and Li+ do not share chemistry-specific claims; Li+ capacity is not a number", () => {
    const na = prod("EBS_NA").specs, li = prod("EBS_LI").specs;
    expect(na.cycle_life.status).toBe("REON CLAIM");
    expect(li.cycle_life).toBeUndefined();
    expect(li.operating_temp).toBeUndefined();
    expect(li.rated_energy_kwh.status).toBe("REON CLAIM");
    expect(typeof li.rated_energy_kwh.value).not.toBe("number");
    expect(E.profiles["EBS Li+"]).toMatch(/not simulated/);
  });
  it("nominal duration is derived from power and energy", () => {
    expect(prod("EBS_NA").specs.nominal_ratio_h.status).toBe("DERIVED");
    expect(prod("EBS_NA").specs.nominal_ratio_h.value).toBe(E.rated_kwh / E.rated_kw);
    expect(E.flags.nominal_ratio_h[0]).toBe("DERIVED");
    for (const [, [st]] of Object.entries(E.flags)) expect(P.statuses).toContain(st);
  });
});

describe("EBS commitments", () => {
  it("energy = power × window, and TypeScript status matches the Python export", () => {
    for (const c of E.cases) for (const hw of ["fixed", "bypass"] as const) {
      const s = summary(E, c, hw);
      expect(s.energyKwh).toBeCloseTo(c[hw].commit_kw * c.window_h, 9);
      expect(c[hw].commit_energy_kwh).toBeCloseTo(s.energyKwh, 9);
      expect(s.status).toBe(c[hw].status);
      expect(s.nominalRatioH).toBe(2);
      expect(c[hw].chance).toBeGreaterThanOrEqual(1 - E.alpha);
      expect(c[hw].outcome.fulfilled).toBe(c[hw].outcome.delivered_kwh >= c[hw].commit_energy_kwh - 1e-6);
    }
  });
  it("30 kW for 3 h (90 kWh) on a 60 kWh rating is infeasible", () => {
    const b = { samples: new Float64Array(0), p5: 500, p50: 500, p95: 500, pAvail: 30 };
    expect(summarizeCommitment({ startHe: 15, windowH: 3, powerKw: 30, expKw: 0 }, b, 30, 60, E.eta).status).toBe("exceeds-rated");
  });
  it("window time (HE) and window length are distinct", () => {
    for (const c of E.cases) { expect(c.start_he).toBe(15); expect([1, 2, 3]).toContain(c.window_h); }
  });
});

describe("EBS 3D states come from the simulation frames", () => {
  it("bypassed cells = inactive cells in a running block; the fixed block never shows bypass", () => {
    for (const c of E.cases) for (const run of [c.bypass.outcome, c.bypass.drain, c.fixed.outcome, c.fixed.drain]) {
      const isB = run === c.bypass.outcome || run === c.bypass.drain;
      for (const fr of run.trace) {
        const n = countStates(cellStates(fr, isB, fr.minute > 0));
        const inactive = Array.from(decode(fr.active_b64)).filter((a) => !a).length;
        if (isB && fr.block_online) expect(n.bypassed).toBe(inactive);
        if (!isB) expect(n.bypassed).toBe(0);
        if (isB && fr.block_online) expect(fr.bypassed_cells).toBe(inactive);
      }
    }
  });
  it("a limiting cell appears only when the engine says an empty cell stopped the fixed string", () => {
    for (const c of E.cases) for (const run of [c.fixed.outcome, c.fixed.drain]) {
      const last = run.trace[run.trace.length - 1];
      const lim = countStates(cellStates(last, false, true)).limiting;
      if (run.stop_reason?.includes("empty cell")) { expect(lim).toBeGreaterThan(0); expect(run.stop_cell).not.toBeNull(); }
      else { expect(lim).toBe(0); expect(run.stop_cell).toBeNull(); }
    }
  });
  it("running bypass blocks keep at least N_min cells", () => {
    for (const c of E.cases) for (const fr of c.bypass.drain.trace) if (fr.block_online)
      expect(Array.from(decode(fr.active_b64)).filter(Boolean).length).toBeGreaterThanOrEqual(E.n_min);
  });
  it("stages: bypass stage is null when no cell was bypassed", () => {
    for (const c of E.cases) {
      const s = stages({ fixed: c.fixed.outcome, bypass: c.bypass.outcome }, c.window_h * 60);
      expect(s.bypass).toBe(c.bypass.outcome.first_bypass_min);
      if (c.bypass.outcome.bypassed_cells === 0) expect(s.bypass).toBeNull();
    }
  });
});

describe("honest differences", () => {
  it("both blocks start from identical cells: zero difference before the window", () => {
    for (const c of E.cases) {
      const m = diffMask(frameAt(c.fixed.outcome.trace, -30), frameAt(c.bypass.outcome.trace, -30));
      expect(m.filter(Boolean).length).toBe(0);
    }
  });
  it("natural spread, 1 h window: no measurable difference is reported as none", () => {
    const c = E.cases.find((x) => x.weak_factor === 1 && x.window_h === 1)!;
    expect(c.bypass.commit_kw).toBe(c.fixed.commit_kw);
    expect(Math.abs(c.bypass.outcome.delivered_kwh - c.fixed.outcome.delivered_kwh)).toBeLessThan(0.5);
  });
});
