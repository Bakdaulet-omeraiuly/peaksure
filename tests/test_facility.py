"""Facility load data contract and demand-target recommendation."""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from peaksure.facility import G2_DEMAND_USD_PER_KW_MONTH, demand_target, peak_day, validate

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "web/public/data/sample_facility_load_SYNTHETIC.csv"


def frame(kw, freq="60min", start="2026-07-15"):
    t = pd.date_range(start, periods=len(kw), freq=freq)
    return pd.DataFrame({"timestamp": t.strftime("%Y-%m-%dT%H:%M"), "kw": kw})


def test_sample_dataset_passes_and_is_flagged_hourly():
    r, s = validate(pd.read_csv(SAMPLE))
    assert r.ok and s is not None and r.interval_min == 60
    assert any("15-minute" in w for w in r.warnings)


@pytest.mark.parametrize("df,msg", [
    (pd.DataFrame({"time": ["2026-07-01T00:00"] * 5, "load": [1] * 5}), "header"),
    (frame([10, 12, "x", 14, 15]), "non-numeric"),
    (frame([10, -2, 11, 12, 13]), "negative"),
    (frame([12000, 13000, 12500, 14000, 15000]), "watts"),
    (frame([0.05, 0.06, 0.05, 0.07, 0.08]), "MW"),
    (frame([10, 11, 12, 13, 14], freq="7min"), "interval"),
])
def test_malformed_or_wrong_unit_input_is_rejected(df, msg):
    r, s = validate(df)
    assert not r.ok and s is None
    assert any(msg in e for e in r.errors), r.errors


def test_duplicates_gaps_and_stale_data():
    df = frame([10, 11, 12, 13, 14, 15])
    df.loc[3, "timestamp"] = df.loc[2, "timestamp"]
    r, _ = validate(df)
    assert any("duplicate" in e for e in r.errors)
    g = frame([10, 11, 12, 13, 14, 15]).drop(index=[2])
    r, _ = validate(g)
    assert r.ok and any("gaps" in w for w in r.warnings)
    r, _ = validate(frame([10, 11, 12, 13, 14]), now=pd.Timestamp("2026-11-08"))
    assert any("stale" in w for w in r.warnings)


def test_demand_target_respects_energy_and_power():
    load = np.array([40, 50, 60, 80, 100, 90, 70, 50], float)
    t = demand_target(load, 1.0, energy_kwh=30.0, power_kw=30.0)
    need = np.clip(load - t.target_kw, 0, None)
    assert need.sum() <= 30.0 + 1e-6 and need.max() <= 30.0 + 1e-6
    assert t.energy_kwh == pytest.approx(need.sum()) and t.reduction_kw == pytest.approx(100 - t.target_kw)
    assert t.binding == "energy"
    big = demand_target(load, 1.0, energy_kwh=500.0, power_kw=30.0)
    assert big.target_kw == pytest.approx(70.0) and big.binding == "power"   # rated power caps the shave
    assert demand_target(load, 1.0, 0.0, 30.0).reduction_kw == 0.0


def test_more_energy_never_raises_the_target():
    rng = np.random.default_rng(1)
    load = 50 + 40 * rng.random(96)
    ts = [demand_target(load, 0.25, e, 30.0).target_kw for e in (5, 10, 20, 40, 60)]
    assert all(a >= b - 1e-6 for a, b in zip(ts, ts[1:]))


def test_peak_day_and_tariff():
    s = pd.Series([1.0] * 48, index=pd.date_range("2026-07-01", periods=48, freq="h"))
    s.iloc[30] = 9.0
    assert peak_day(s).index[0] == pd.Timestamp("2026-07-02")
    assert G2_DEMAND_USD_PER_KW_MONTH == 15.24


def test_sample_target_fixture_matches_typescript():
    """Python reference values for the TypeScript port (web/src/engine/facility.test.ts reads this fixture)."""
    fx = json.loads((ROOT / "web/src/engine/__fixtures__/python_facility.json").read_text())
    r, s = validate(pd.read_csv(SAMPLE))
    day = peak_day(s)
    for case in fx["cases"]:
        t = demand_target(day.values, 1.0, case["energy_kwh"], case["power_kw"])
        assert t.target_kw == pytest.approx(case["target_kw"], abs=1e-6)
        assert t.energy_kwh == pytest.approx(case["need_kwh"], abs=1e-6)
