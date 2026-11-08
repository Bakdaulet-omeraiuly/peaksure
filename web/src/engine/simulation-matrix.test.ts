import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Constants, Life, PeakEvent } from "./data";
import { buildScenario } from "./scenario";

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
  { name: "4h start of life", date: "2025-06-24", duration: "4h", age: 1, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
  { name: "4h end of life", date: "2025-06-24", duration: "4h", age: 15, kHvac: 0.25, sigmaT: 2.5, probeBudget: 0 },
] as const;

describe("interactive scenario matrix", () => {
  it.each(presets.flatMap((preset) => constants.seeds.map((seed) => ({ ...preset, seed }))))(
    "$name · seed $seed", ({ date, duration, age, kHvac, sigmaT, probeBudget, seed }) => {
      const event = events.find((e) => e.date === date);
      expect(event).toBeDefined();
      const life = read<Life>(`life_${duration}_s${seed}.json`);
      const scenario = buildScenario(constants, life, event!, age, { kHvac, sigmaT, probeBudget, reportBias: 0 });
      expect(scenario.durationKey).toBe(duration);
      for (const key of ["A", "B", "C"] as const) {
        const op = scenario.ops[key];
        expect(op.label).toContain(key);
        expect(op.qRel.length).toBe(cells);
        expect(op.run.soc.length).toBe(op.run.nFrames * cells);
        expect(op.run.active.length).toBe(op.run.nFrames * cells);
        expect(op.run.temp.length).toBe(op.run.nFrames * cells);
        expect(op.run.powerKw.length).toBe(1440);
        expect(op.decision.startHe).toBeGreaterThanOrEqual(1);
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
});
