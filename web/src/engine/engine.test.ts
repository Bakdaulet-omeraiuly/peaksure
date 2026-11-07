import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bypassString, deliverable, containerTemp, Chem, SystemSpec } from "./physics";
import { discharge } from "./discharge";
import { optimize, fixedRule } from "./decision";
import { Constants, Life, PeakEvent, decodeI16, decodeU16 } from "./data";
import { buildScenario } from "./scenario";

const root = path.resolve(__dirname, "../../public/data");
const C: Constants = JSON.parse(fs.readFileSync(path.join(root, "constants.json"), "utf8"));
const life: Life = JSON.parse(fs.readFileSync(path.join(root, "life_2h_s0.json"), "utf8"));
const events: PeakEvent[] = JSON.parse(fs.readFileSync(path.join(root, "events.json"), "utf8"));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "__fixtures__/python_deliverable.json"), "utf8"));

const chem: Chem = { vNom: C.v_nom, coldSlope: C.cold_slope, tChargeMin: C.t_charge_min, tDerate: C.t_derate, tMax: C.t_max };
const qNom = (5000 * 1000) / (C.n_strings * C.n_series * C.v_nom);
const sys: SystemSpec = { nStrings: C.n_strings, nSeries: C.n_series, nMin: Math.round(C.n_series * (1 - C.headroom)),
                          eta: C.eta, switchLoss: C.switch_loss, pStringMax: C.p_max_kw / C.n_strings, qNomAh: qNom };

describe("brief 16-cell example", () => {
  const a = [...Array(15).fill(85), 70];
  it("fixed string = 70 Ah (min)", () => expect(Math.min(...a)).toBe(70));
  it("bypass with N_min = 1 uses every cell", () => expect(bypassString(a, 0, 16, 1).cellAh).toBeCloseTo(15 * 85 + 70));
  it("bypass with N_min = 16 equals the fixed string", () => expect(bypassString(a, 0, 16, 16).cellAh).toBeCloseTo(16 * 70));
});

describe("TypeScript physics matches the Python model", () => {
  const tOff = decodeI16(life.t_off, 100);
  for (const tier of ["fixed", "bypass"] as const) {
    for (const tAmb of [34.4, -18.3, 20.0]) {
      it(`${tier} at ${tAmb} C`, () => {
        const q = decodeU16(life.tiers[tier][8].soh, 20000).map((v) => v * qNom);
        const t = tOff.map((o) => containerTemp(tAmb, C.t_hvac_set, C.k_hvac) + o + C.load_heating_c);
        const d = deliverable(q, tier, 1, t, chem, sys);
        const ref = fixture[`${tier}_${tAmb.toFixed(1).replace(/\.0$/, ".0")}`] ?? fixture[`${tier}_${tAmb}`];
        expect(d.energyKwh).toBeCloseTo(ref.energy, 3);
        expect(d.powerKw).toBeCloseTo(ref.power, 3);
      });
    }
  }
});

describe("minute discharge reproduces analytic deliverable energy", () => {
  it.each(["fixed", "bypass"] as const)("%s to exhaustion", (tier) => {
    const q = decodeU16(life.tiers[tier][8].soh, 20000).map((v) => v * qNom);
    const t = new Float64Array(q.length).fill(25);
    const an = deliverable(q, tier, 1, t, chem, sys).energyKwh;
    const r = discharge({ qAh: q, tBase: t, rRel: new Float64Array(q.length).fill(1), soc0: 1, tier, chem, sys,
                          decision: { startHe: 1, windowH: 12, powerKw: 600, expKw: 0 }, peakHe: 1, loadHeatingC: 0 });
    expect(Math.abs(r.energyKwh - an) / an).toBeLessThan(0.01);
  });
});

describe("decision", () => {
  it("chance constraint holds", () => {
    const d = Array.from({ length: 200 }, (_, i) => 3000 + i * 5);
    const p = optimize(d, 2500, events[0].p_hour, C.he_grid, 0.05);
    const ok = d.filter((x) => x >= p.powerKw * p.windowH).length / d.length;
    expect(ok).toBeGreaterThanOrEqual(0.95);
  });
  it("fixed rule uses full power when energy allows one hour", () => {
    const r = fixedRule(3600, 2500, events[0].p_hour, C.he_grid);
    expect(r.powerKw).toBe(2500);
    expect(r.windowH).toBe(1);
  });
});

describe("scenario", () => {
  it("builds the 2025 annual peak at year 9 and REON delivers at least as much energy", () => {
    const ev = events.find((e) => e.is_annual && e.year === 2025)!;
    const sc = buildScenario(C, life, ev, 9, { kHvac: C.k_hvac, sigmaT: C.sigma_t_cell, probeBudget: 0, reportBias: 0 });
    expect(sc.ops.C.truthKwh).toBeGreaterThan(sc.ops.A.truthKwh);
    expect(sc.ops.A.run.energyKwh).toBeGreaterThan(0);
  });
});
