// Data contract, malformed inputs, and Python/TypeScript agreement for the demand-target recommendation.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { continuitySchedule, demandTarget, peakDay, recommend, plantCheck, validate, G2 } from "./facility";
import { EbsScenarioFile } from "./ebsScenario";

const root = path.resolve(__dirname, "../../public/data");
const sample = fs.readFileSync(path.join(root, "sample_facility_load_SYNTHETIC.csv"), "utf8");
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "__fixtures__/python_facility.json"), "utf8"));
const E: EbsScenarioFile & { energy_curves: { weak_factor: number; belief: Record<string, { kw: number[]; p5: number[] }>; plant: Record<string, { kw: number[]; kwh: number[] }> }[] } =
  JSON.parse(fs.readFileSync(path.join(root, "ebs_scenario.json"), "utf8"));
const csv = (rows: [string, string | number][], header = "timestamp,kw") => [header, ...rows.map(([t, k]) => `${t},${k}`)].join("\n");
const hours = (vals: (number | string)[], start = "2026-07-15T00:00", stepMin = 60): [string, string | number][] =>
  vals.map((v, i) => { const d = new Date(new Date(start).getTime() + i * stepMin * 60000); const p = (n: number) => String(n).padStart(2, "0");
    return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`, v]; });

describe("data contract", () => {
  it("sample dataset passes and is flagged as hourly", () => {
    const { report, series } = validate(sample);
    expect(report.ok).toBe(true);
    expect(series!.length).toBe(744);
    expect(report.warnings.join(" ")).toMatch(/15-minute/);
    expect(report.start).toBe("2026-07-01T00:00");      // local site time, not shifted to UTC
    expect(report.end).toBe("2026-07-31T23:00");
  });
  it.each([
    [csv(hours([1, 2, 3, 4, 5]), "time,load"), /header/],
    [csv(hours([10, 12, "x", 14, 15])), /non-numeric/],
    [csv(hours([10, -2, 11, 12, 13])), /negative/],
    [csv(hours([12000, 13000, 12500, 14000, 15000])), /watts/],
    [csv(hours([0.05, 0.06, 0.05, 0.07, 0.08])), /MW/],
    [csv(hours([10, 11, 12, 13, 14], "2026-07-15T00:00", 7)), /interval/],
    [csv([["not a date", 3], ["2026-07-15T01:00", 4], ["2026-07-15T02:00", 5], ["2026-07-15T03:00", 6], ["2026-07-15T04:00", 7]]), /timestamp/],
  ])("rejects malformed or wrong-unit input %#", (text, msg) => {
    const { report, series } = validate(text);
    expect(report.ok).toBe(false);
    expect(series).toBeNull();
    expect(report.errors.join(" ")).toMatch(msg);
  });
  it("flags duplicates, gaps and stale data", () => {
    const rows = hours([10, 11, 12, 13, 14, 15]);
    rows[3][0] = rows[2][0];
    expect(validate(csv(rows)).report.errors.join(" ")).toMatch(/duplicate/);
    const gap = hours([10, 11, 12, 13, 14, 15]); gap.splice(2, 1);
    const g = validate(csv(gap)).report;
    expect(g.ok).toBe(true);
    expect(g.warnings.join(" ")).toMatch(/gaps/);
    expect(validate(csv(hours([10, 11, 12, 13, 14])), new Date("2026-11-08")).report.warnings.join(" ")).toMatch(/stale/);
  });
});

describe("demand target", () => {
  it("matches the Python reference on the sample peak day", () => {
    const day = peakDay(validate(sample).series!).map((p) => p.kw);
    expect(day).toEqual(fx.day_kw);
    for (const c of fx.cases) {
      const t = demandTarget(day, 1, c.energy_kwh, c.power_kw);
      expect(t.targetKw).toBeCloseTo(c.target_kw, 6);
      expect(t.energyKwh).toBeCloseTo(c.need_kwh, 6);
      expect(t.binding).toBe(c.binding);
      expect(t.firstHe).toBe(c.first_he);
      expect(t.lastHe).toBe(c.last_he);
    }
  });
  it("never needs more energy or power than allowed; energy = sum of interval discharge × dt", () => {
    const day = fx.day_kw as number[];
    for (const [e, p] of [[20, 30], [53, 30], [500, 30], [53, 10]]) {
      const t = demandTarget(day, 1, e, p);
      expect(t.energyKwh).toBeLessThanOrEqual(e + 1e-6);
      expect(t.maxDischargeKw).toBeLessThanOrEqual(p + 1e-6);
      expect(t.energyKwh).toBeCloseTo(t.dischargeKw.reduce((a, v) => a + v, 0), 9);
      expect(t.energyKwh).toBeLessThanOrEqual(t.maxDischargeKw * t.hours + 1e-6);   // shaped dispatch <= flat P × H
    }
  });
  it("recommendation uses the belief only; the plant check is separate and after the event", () => {
    const day = fx.day_kw as number[];
    for (const c of E.energy_curves) for (const hw of ["fixed", "bypass"]) {
      const b = c.belief[hw], pl = c.plant[hw];
      const rec = recommend(day, 1, E.rated_kw, b.kw, b.p5);
      expect(rec.energyLimitKwh).toBeCloseTo(b.p5[b.p5.length - 1], 9);
      expect(rec.target.energyKwh).toBeLessThanOrEqual(rec.energyLimitKwh + 1e-6);
      expect(rec.target.maxDischargeKw).toBeLessThanOrEqual(E.rated_kw + 1e-6);
      const chk = plantCheck(rec.target, pl.kw, pl.kwh);
      expect(chk.delivered).toBe(rec.target.energyKwh <= chk.availableKwh + 1e-6);
    }
  });
  it("uses the confirmed G-2 demand charge", () => {
    expect(G2.usdPerKwMonth).toBe(15.24);
    expect(E.demand_charge["G-2"]).toBe(G2.usdPerKwMonth);
    expect(E.flags.demand_charge[0]).toBe("CONFIRMED");
  });
  it("keeps an operating reserve and recharges off-peak without a rebound peak", () => {
    const load = Array(24).fill(20); load.splice(14, 3, 42, 48, 40);
    const discharge = load.map((v) => Math.max(0, v - 30));
    const p = continuitySchedule(load, discharge, 1, 50, 10, 30, 30, 0.96);
    expect(p.dispatchShortfallKwh).toBeCloseTo(0, 9);
    expect(p.minStoredKwh).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(Math.max(...p.gridKw)).toBeLessThanOrEqual(30 + 1e-9);
    expect(new Set(p.modes)).toEqual(new Set(["standby", "discharge", "charge"]));
  });
  it("lets the grid backfill instead of crossing the battery reserve", () => {
    const p = continuitySchedule([50, 50], [30, 30], 1, 20, 10, 50, 0);
    expect(p.dischargedKwh).toBeCloseTo(10, 9);
    expect(p.dispatchShortfallKwh).toBeCloseTo(50, 9);
    expect(p.minStoredKwh).toBeCloseTo(10, 9);
    expect(p.gridKw).toEqual([40, 50]);
  });
});
