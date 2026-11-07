import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Constants, Life, PeakEvent } from "./data";
import { buildScenario } from "./scenario";

const root = path.resolve(__dirname, "../../public/data");
const C: Constants = JSON.parse(fs.readFileSync(path.join(root, "constants.json"), "utf8"));
const events: PeakEvent[] = JSON.parse(fs.readFileSync(path.join(root, "events.json"), "utf8"));
const life = (d: string, s = 0): Life => JSON.parse(fs.readFileSync(path.join(root, `life_${d}_s${s}.json`), "utf8"));
const annual25 = events.find((e) => e.is_annual && e.year === 2025)!;
const jan19 = events.find((e) => e.year === 2019 && e.month === 1)!;

const cases: [string, string, PeakEvent, number, number, number][] = [
  ["CES base", "2h", annual25, 9, 0.25, 2.5],
  ["hot + weak cooling", "2h", annual25, 12, 0.9, 6],
  ["old 1-h", "1h", annual25, 12, 0.25, 2.5],
  ["4-h", "4h", annual25, 9, 0.25, 2.5],
  ["winter 1-h", "1h", jan19, 12, 0.25, 2.5],
];

describe("presets", () => {
  it.each(cases)("%s", (_n, d, ev, age, k, sT) => {
    const sc = buildScenario(C, life(d), ev, age, { kHvac: k, sigmaT: sT, probeBudget: 4, reportBias: 0 });
    const A = sc.ops.A, Cc = sc.ops.C;
    console.log(_n, { A: [Math.round(A.truthKwh), Math.round(A.decision.powerKw), A.decision.windowH, A.decision.startHe, Math.round(A.shavedKw), Math.round(A.valueUsd)],
      C: [Math.round(Cc.truthKwh), Math.round(Cc.decision.powerKw), Cc.decision.windowH, Cc.decision.startHe, Math.round(Cc.shavedKw), Math.round(Cc.valueUsd)],
      probes: Cc.probes.length, ev: A.run.events.length + "/" + Cc.run.events.length, tmax: A.run.temp.reduce((m, v) => Math.max(m, v), -1e9).toFixed(1) });
    expect(Cc.truthKwh).toBeGreaterThanOrEqual(A.truthKwh * 0.99);
  });
});
