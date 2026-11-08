import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Constants, Life, PeakEvent } from "./data";
import { buildScenario, validateModelInputs } from "./scenario";
import { commitmentEnergy, commitmentFeasibility, heClockRange } from "./commitment";
import { differenceMinute } from "./ebs-view";

const root = path.resolve(__dirname, "../../public/data");
const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const constants = read<Constants>("constants.json");
const events = read<PeakEvent[]>("events.json");
const cells = constants.n_strings * constants.n_series;

const presets = [
  { name: "base", date: "2025-06-24", duration: "2h", age: 9, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "hot and weak cooling", date: "2025-06-24", duration: "2h", age: 12, kHvac: 0.9, sigmaT: 6, probeBudget: 0 },
  { name: "winter aged 1h", date: "2019-01-21", duration: "1h", age: 12, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "diagnostic probes", date: "2019-05-20", duration: "2h", age: 6, kHvac: 0.25, sigmaT: 2.5, probeBudget: 4 },
  { name: "3h hypothetical", date: "2025-06-24", duration: "3h", age: 9, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "4h start of life", date: "2025-06-24", duration: "4h", age: 1, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "4h end of life", date: "2025-06-24", duration: "4h", age: 15, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
] as const;

describe("interactive scenario matrix", () => {
  it("separates CES/CESS product claims from unknown internals and model assumptions", () => {
    const p = constants.product_profile;
    expect(p.rated_power_kw.status).toBe("REON CLAIM");
    expect(p.rated_energy_kwh.status).toBe("REON CLAIM");
    expect(p.rated_duration_h.status).toBe("DERIVED");
    expect(p.rated_duration_h.value).toBe(p.rated_energy_kwh.value / p.rated_power_kw.value);
    expect(p.ac_interface.value).toContain("AC");
    expect(p.chemistry.status).toBe("UNKNOWN");
    expect(p.cell_dc_topology.status).toBe("UNKNOWN");
    expect(constants.flags.chemistry[0]).toBe("ASSUMED");
    expect(constants.flags.dc_window[0]).toBe("UNKNOWN");
  });
  it.each(presets.flatMap((preset) => constants.seeds.map((seed) => ({ ...preset, seed }))))(
    "$name · seed $seed", ({ date, duration, age, kHvac, sigmaT, probeBudget, seed }) => {
      const event = events.find((e) => e.date === date);
      expect(event).toBeDefined();
      const life = read<Life>(`life_${duration}_s${seed}.json`);
      const scenario = buildScenario(constants, life, event!, age, { kHvac, sigmaT, probeBudget, reportBias: 0 });
      expect(scenario.durationKey).toBe(duration);
      expect(scenario.eNom).toBe(constants.p_max_kw * Number(duration[0]));
      for (const key of ["A", "B", "C"] as const) {
        const op = scenario.ops[key];
        expect(op.label).toContain(key);
        expect(op.qRel.length).toBe(cells);
        expect(op.run.soc.length).toBe(op.run.nFrames * cells);
        expect(op.run.active.length).toBe(op.run.nFrames * cells);
        expect(op.run.temp.length).toBe(op.run.nFrames * cells);
        expect(op.run.powerKw.length).toBe(1440);
        expect(op.decision.startHe).toBeGreaterThanOrEqual(1);
        expect(op.decision.windowH).toBeGreaterThanOrEqual(1);
        expect(op.decision.windowH).toBeLessThanOrEqual(6);
        expect(commitmentEnergy(op.decision)).toBeCloseTo(op.decision.powerKw * op.decision.windowH, 8);
        expect(heClockRange(op.decision)).toContain(":00–");
        if (op.decision.powerKw > 0) {
          if (key === "C") {
            const fraction = [...op.belief.samples].filter((v) => v >= commitmentEnergy(op.decision)).length / op.belief.samples.length;
            expect(fraction).toBeGreaterThanOrEqual(0.95 - 1e-9);
          } else {
            expect(commitmentEnergy(op.decision)).toBeLessThanOrEqual(op.belief.p5 + 1e-6);
          }
        }
        if (key === "C") {
          expect(op.rawTwinBelief).toBeDefined();
          expect(op.belief.p5).toBeLessThanOrEqual(op.rawTwinBelief!.p5 + 1e-9);
          expect(op.belief.pAvail).toBeLessThanOrEqual(op.rawTwinBelief!.pAvail + 1e-9);
        }
        expect(op.run.startMin + op.run.nFrames - 1).toBeLessThanOrEqual(1440);
        expect(Number.isFinite(op.run.energyKwh)).toBe(true);
        expect(Number.isFinite(op.valueUsd)).toBe(true);
        expect(op.run.energyKwh).toBeGreaterThanOrEqual(0);
        expect(op.run.powerKw.every((p) => p >= 0 && p <= constants.p_max_kw + 0.1)).toBe(true);
        expect(op.drain).toBeDefined();
        expect(op.drain!.soc.length).toBe(op.drain!.nFrames * cells);
      }
    },
  );
  it("keeps battery duration independent of age and commitment window", () => {
    const life = read<Life>("life_4h_s0.json");
    const ev = events.find((e) => e.date === "2025-06-24")!;
    for (const age of [1, 9, 15]) {
      const s = buildScenario(constants, life, ev, age, { kHvac: 0.25, sigmaT: 2.5, probeBudget: 0, reportBias: 0 });
      expect(s.durationKey).toBe("4h");
      expect(s.eNom).toBe(constants.durations["4h"]);
      expect(s.age).toBe(age);
      expect(s.event.he).toBe(ev.he);
    }
  });
  it("rejects impossible cell-count and N_min assumptions", () => {
    const life = read<Life>("life_2h_s0.json");
    const knobs = { kHvac: 0.25, sigmaT: 2.5, probeBudget: 0, reportBias: 0 };
    expect(validateModelInputs({ ...constants, headroom: 1 }, life, knobs)).toMatch(/N_min/);
    expect(validateModelInputs({ ...constants, headroom: -0.5 }, life, knobs)).toMatch(/N_min/);
    expect(validateModelInputs(constants, life, { ...knobs, headroom: 1 })).toMatch(/N_min/);
    expect(validateModelInputs({ ...constants, eta: 0 }, life, knobs)).toMatch(/efficiency/);
    expect(validateModelInputs(constants, life, { ...knobs, eta: 1.1 })).toMatch(/efficiency/);
    expect(commitmentFeasibility({ startHe: 17, windowH: 3, powerKw: 2000, expKw: 0 }, 5000, 2500).energyOk).toBe(false);
  });
  it("treats cell-to-AC efficiency as a live operational sensitivity", () => {
    const life = read<Life>("life_2h_s0.json");
    const ev = events.find((e) => e.date === "2025-06-24")!;
    const knobs = { kHvac: 0.25, sigmaT: 2.5, probeBudget: 0, reportBias: 0 };
    const low = buildScenario(constants, life, ev, 9, { ...knobs, eta: 0.90 });
    const high = buildScenario(constants, life, ev, 9, { ...knobs, eta: 0.99 });
    expect(high.ops.A.truthKwh).toBeGreaterThan(low.ops.A.truthKwh);
    expect(high.ops.B.truthKwh).toBeGreaterThan(low.ops.B.truthKwh);
  });
  it("treats bypass headroom as an assumed operational sensitivity", () => {
    const life = read<Life>("life_2h_s0.json");
    const ev = events.find((e) => e.date === "2025-06-24")!;
    const knobs = { kHvac: 0.25, sigmaT: 2.5, probeBudget: 0, reportBias: 0 };
    const narrow = buildScenario(constants, life, ev, 9, { ...knobs, headroom: 0.02 });
    const wide = buildScenario(constants, life, ev, 9, { ...knobs, headroom: 0.20 });
    expect(wide.sys.nMin).toBeLessThan(narrow.sys.nMin);
    expect(wide.ops.B.truthKwh).toBeGreaterThanOrEqual(narrow.ops.B.truthKwh);
    expect(wide.ops.A.truthKwh).toBe(narrow.ops.A.truthKwh);
  });
});

interface EBSFrame { minute: number; power_kw: number; bypassed_cells: number; block_online: boolean; soc_b64: string; active_b64: string }
interface EBSRun { energy_kwh: number; power_trace: EBSFrame[]; weak_cell: number }
interface EBSRow { weak_factor: number; dc_floor_v: number; fixed: EBSRun; bypass: EBSRun; extra_kwh: number }
interface EBSExport { assumptions: { blocks: number; block_kw: number; cells_per_block: number }; rows: EBSRow[] }

describe("EBS sensitivity simulation export", () => {
  const exportData = read<EBSExport>("ebs.json");
  it("has a synchronized cell frame for every setting and replay step", () => {
    expect(exportData.rows.length).toBe(15);
    for (const row of exportData.rows) {
      expect(row.extra_kwh).toBeCloseTo(row.bypass.energy_kwh - row.fixed.energy_kwh, 5);
      expect(row.fixed.weak_cell).toBe(row.bypass.weak_cell);
      for (const run of [row.fixed, row.bypass]) {
        expect(run.power_trace.length).toBe(49);
        for (const [i, frame] of run.power_trace.entries()) {
          expect(frame.minute).toBe(i * 5);
          expect(frame.power_kw).toBeGreaterThanOrEqual(0);
          expect(frame.power_kw).toBeLessThanOrEqual(exportData.assumptions.blocks * exportData.assumptions.block_kw);
          expect(Buffer.from(frame.soc_b64, "base64").length).toBe(exportData.assumptions.cells_per_block);
          expect(Buffer.from(frame.active_b64, "base64").length).toBe(exportData.assumptions.cells_per_block);
        }
      }
      expect(row.fixed.power_trace[0].soc_b64).toBe(row.bypass.power_trace[0].soc_b64);
    }
  });
  it("finds a visible bypass difference and preserves a zero-result setting", () => {
    const strong = exportData.rows.find((r) => r.weak_factor === 0.8 && r.dc_floor_v === 300)!;
    const minute = differenceMinute(strong);
    const i = minute / 5;
    expect(minute).toBeGreaterThan(0);
    expect(strong.fixed.power_trace[i].block_online).toBe(false);
    expect(strong.bypass.power_trace[i].block_online).toBe(true);
    const zero = exportData.rows.find((r) => r.weak_factor === 0.8 && r.dc_floor_v === 750)!;
    expect(zero.extra_kwh).toBe(0);
    expect(differenceMinute(zero)).toBe(0);
  });
});
