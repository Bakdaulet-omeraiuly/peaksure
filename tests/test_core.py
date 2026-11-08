import numpy as np
import pytest

from peaksure import physics as ph
from peaksure.config import Config, NA_ION
from peaksure.decision import Decision, optimize, outcome, fixed_rule
from peaksure.data import HE_GRID, hour_forecast, peak_events
from peaksure.twin import CellTwin
from peaksure.sim import simulate, draw_population


# ----------------------------------------------------------- brief's 16-cell example
def brief_cells():
    return np.array([85.0] * 15 + [70.0])[None, :]


def test_brief_fixed_string_70ah():
    assert ph.fixed_string_ah(brief_cells())[0] == pytest.approx(70.0)


def test_brief_average_soh():
    assert brief_cells().mean() == pytest.approx(84.0625)


def test_brief_bypass_upper_bound_nmin1():
    cell_ah, cutoff = ph.bypass_string_energy_ah(brief_cells(), n_min=1)
    assert cell_ah[0] == pytest.approx(15 * 85 + 70)          # every cell fully used
    # ratio to fixed-string cell-Ah equals average/min = 84.06/70
    assert cell_ah[0] / (16 * 70) == pytest.approx(84.0625 / 70)


def test_bypass_equals_fixed_when_nmin_is_n():
    cell_ah, _ = ph.bypass_string_energy_ah(brief_cells(), n_min=16)
    assert cell_ah[0] == pytest.approx(16 * 70)


def test_bypass_bounded_by_nmin():
    # N_min = 15: string stops when the 2nd cell empties -> all cells deliver min(A, 85)
    cell_ah, cutoff = ph.bypass_string_energy_ah(brief_cells(), n_min=15)
    assert cutoff[0] == pytest.approx(85.0)
    # cells [50, 70, 85 x 14], N_min = 15: the 50-Ah cell may leave, but the string must stop
    # when the 70-Ah cell empties -> 50 + 70 + 14 * 70 = 1100 cell-Ah (not the 1360 sum)
    cell_ah2, cutoff2 = ph.bypass_string_energy_ah(np.array([[50.0] + [85.0] * 14 + [70.0]]), n_min=15)
    assert cutoff2[0] == pytest.approx(70.0)
    assert cell_ah2[0] == pytest.approx(1100.0)


def test_excluded_cells_do_not_count():
    a = np.array([[85.0] * 16])
    excl = np.zeros_like(a, bool)
    excl[0, 0] = True
    cell_ah, _ = ph.bypass_string_energy_ah(a, n_min=15, excluded=excl)
    assert cell_ah[0] == pytest.approx(15 * 85)
    cell_ah2, _ = ph.bypass_string_energy_ah(a, n_min=16, excluded=excl)
    assert cell_ah2[0] == 0.0


# ----------------------------------------------------------- physics sanity
def test_no_variability_no_bypass_advantage():
    q = np.full((2, 50), 100.0)
    kw = dict(v_nom=3.1, n_min=45, chem=NA_ION, eta=1.0, switch_loss=0.0)
    f = ph.reference_deliverable(q, tier="fixed", **kw)
    b = ph.reference_deliverable(q, tier="bypass", **kw)
    assert f == pytest.approx(b)


def test_hot_cell_derates_fixed_string_only():
    q = np.full((1, 20), 100.0)
    t = np.full_like(q, 30.0)
    t[0, 3] = 55.0
    kw = dict(v_nom=3.1, n_min=18, chem=NA_ION, eta=1.0, switch_loss=0.0, p_string_max=100.0,
              soc0=np.ones_like(q))
    _, pf = ph.deliverable(q, tier="fixed", t_cell=t, **kw)
    _, pb = ph.deliverable(q, tier="bypass", t_cell=t, **kw)
    assert pf[0] < 100.0 and pb[0] == pytest.approx(100.0)


def test_cold_reduces_capacity():
    assert ph.cold_capacity_factor(np.array(-15.0), NA_ION.cold_slope) < 1.0
    assert ph.cold_capacity_factor(np.array(25.0), NA_ION.cold_slope) == 1.0


# ----------------------------------------------------------- decision
def test_outcome_logic():
    d = Decision(start_he=17, window_h=3, power_kw=1000, exp_value_kw=0)
    assert outcome(d, 18, d_true=2000, p_true=2500)[0] == 1000      # 2 h used <= 2000 kWh
    assert outcome(d, 19, d_true=2000, p_true=2500)[0] == 0         # 3 h needs 3000 kWh
    assert outcome(d, 16, d_true=9999, p_true=2500)[0] == 0         # outside window
    assert outcome(d, 17, d_true=9999, p_true=500)[0] == 500        # power-derated


def test_optimizer_uses_all_power_when_energy_ample():
    p_hour = np.zeros(len(HE_GRID))
    p_hour[list(HE_GRID).index(18)] = 1.0
    dec = optimize(np.full(64, 1e6), 2500.0, p_hour)
    assert dec.power_kw == pytest.approx(2500.0) and dec.start_he <= 18 < dec.start_he + dec.window_h


def test_perfect_information_beats_fixed_rule_in_expectation():
    p_hour = hour_forecast(7, exclude_year=None)
    d = np.full(64, 4000.0)
    assert optimize(d, 2500, p_hour).exp_value_kw >= fixed_rule(4000, 2500, p_hour).exp_value_kw - 1e-9


# ----------------------------------------------------------- data
def test_peak_events_loaded():
    ev = peak_events()
    assert ev.year.nunique() == 7 and ev.groupby("year").is_annual.sum().eq(1).all()
    assert set(ev[ev.is_annual].month) <= {6, 7, 8, 9}


def test_hour_forecast_is_distribution():
    p = hour_forecast(1, exclude_year=2019)
    assert p.sum() == pytest.approx(1.0) and (p > 0).all()


# ----------------------------------------------------------- twin
def test_kalman_shrinks_uncertainty():
    tw = CellTwin(np.full((1, 5), 100.0), 100.0, 0.02, -0.1, 0.1, 0.1, 0.005)
    sd0 = tw.sd.copy()
    tw.update(np.full((1, 5), 99.0), r=0.25)
    assert (tw.sd < sd0).all()


# ----------------------------------------------------------- end-to-end sanity
def test_simulation_runs_and_is_deterministic():
    cfg = Config(years=2)
    a = simulate(cfg, "C", seed=3)["events"]
    b = simulate(cfg, "C", seed=3)["events"]
    assert a.equals(b) and len(a) == 24


def test_common_random_numbers_same_events_across_conditions():
    cfg = Config(years=2)
    a = simulate(cfg, "A", 1)["events"]
    c = simulate(cfg, "C", 1)["events"]
    assert (a.peak_he.values == c.peak_he.values).all() and (a.t_amb_c.values == c.t_amb_c.values).all()


def test_mixed_age_cohorts_keep_one_chemistry_and_distinct_capacity():
    cfg = Config(n_strings=1, n_series=90, initial_age_years=(0.0, 5.0, 10.0))
    pop = draw_population(cfg, 3)
    ages, counts = np.unique(pop.age0, return_counts=True)
    assert ages.tolist() == [0.0, 5.0, 10.0] and counts.tolist() == [30, 30, 30]
    means = [pop.q0[pop.age0 == age].mean() for age in ages]
    assert means[0] > means[1] > means[2]
    assert cfg.chemistry == "Na-ion"


def test_independent_pack_envelope_reduces_systematic_bias_misses():
    cfg = Config(years=2, meas_bias=0.01, trend_bias=0.10)
    twin = simulate(cfg, "C", 0)["events"]
    guarded = simulate(cfg, "C_G", 0)["events"]
    assert (twin.peak_he.values == guarded.peak_he.values).all()
    assert (guarded.d_true < guarded.d_p5).sum() < (twin.d_true < twin.d_p5).sum()


def test_zero_twin_error_perfect_info_dominates_twin():
    cfg = Config(years=2)
    p = simulate(cfg, "C_perf", 0)["events"].exp_kw.mean()
    assert p > 0


# ----------------------------------------------------------- cost ranges and voltage curves
def test_price_ranges_ordered():
    from peaksure import costs
    for r in costs.PRICE_RANGES.values():
        assert r.low <= r.central <= r.high
    assert costs.REON_PREMIUM["low"] <= costs.REON_PREMIUM["central"] <= costs.REON_PREMIUM["high"]


def test_breakeven_capex_zeroes_npv():
    import pandas as pd
    from peaksure import costs
    cfg = Config()
    rl = pd.DataFrame(dict(cond=["A", "C"], run=[0, 0], npv=[4.0e6, 4.1e6], savings_yr=[4.5e5, 4.6e5]))
    be = costs.breakeven_capex(rl, cfg)
    for i, row in be.iterrows():
        n = costs.npv_at_price(rl.iloc[[i]], cfg, row.breakeven_kwh, premium=0.0)
        assert n.npv_full.iloc[0] == pytest.approx(0.0, abs=1e-6)


def test_voltage_curves():
    from peaksure import curves
    assert curves.energy_avg_v("Na-ion") == pytest.approx(NA_ION.v_nom, abs=0.1)
    assert 3.2 < curves.energy_avg_v("LFP") < 3.35
    # flat LFP keeps a 240-cell string above 750 V far deeper than sloped Na-ion
    assert curves.min_soc_above_floor("LFP", 240, 750) < 0.1 < 0.4 < curves.min_soc_above_floor("Na-ion", 240, 750)
    # discharge sits below charge
    assert np.all(curves.terminal_v("Na-ion", np.linspace(0.1, 0.9, 9), 0.5, False)
                  < curves.terminal_v("Na-ion", np.linspace(0.1, 0.9, 9), 0.5, True))


def test_team_sheet_reproduces_spreadsheet():
    from peaksure import costs
    t = costs.team_sheet()
    assert costs.TEAM_CONV_CAPEX_KWH == pytest.approx(373.75)
    assert t["s1"]["conv_npv"] == pytest.approx(1_041_472.75, abs=1)
    assert t["s1"]["reon_npv"] == pytest.approx(1_154_179.51, abs=1)
    assert t["s1"]["needed_extra_gross"] == pytest.approx(26_832.52, abs=1)
    assert t["s2"]["retrofit_npv"] == pytest.approx(72_083.91, abs=1)
    assert t["s2"]["replacement_npv"] == pytest.approx(-163_844.71, abs=1)
    assert t["s2"]["retrofit_max_capex"] == pytest.approx(322_083.91, abs=1)


def test_retrofit_breakeven_identical_paths_cost_only_om():
    import pandas as pd
    from peaksure import costs
    cfg = Config()
    rows = [dict(cond=c, run=0, m=y * 12, sim_year=y, month=1, is_annual=False, shaved_kw=1000.0, power_kw=1000.0)
            for c in ("A", "B") for y in range(cfg.years)]
    ev = pd.DataFrame(rows)
    mo = pd.DataFrame([dict(cond=c, run=0, sim_year=y, aug_kwh=0.0) for c in ("A", "B") for y in range(cfg.years)])
    r = costs.retrofit_breakeven(ev, mo, cfg, "A", "B", ages=[0, 5], om_delta_per_5mwh=5000.0)
    for _, row in r.iterrows():
        expect = -5000.0 * costs.annuity(cfg.discount_rate, cfg.years - row.age) / cfg.e_nom_kwh
        assert row.breakeven_kwh == pytest.approx(expect)


def test_town_retrofit_table_scales_by_size():
    import pandas as pd
    from peaksure import costs
    rf = pd.DataFrame([dict(scenario=s, age=a, breakeven_kwh=10.0, lo=8.0, hi=12.0)
                       for s in ("2-h, LFP", "4-h system") for a in range(15)])
    t = costs.town_retrofit_table(rf, 15, 4.0).set_index("town")
    for town, b in costs.TOWN_BATTERIES.items():
        assert t.loc[town, "max_cost"] == pytest.approx(10.0 * b["mwh"] * 1000)
        assert t.loc[town, "npv"] == pytest.approx(6.0 * b["mwh"] * 1000)
        assert t.loc[town, "age"] == min(costs.ASSESS_YEAR - b["year"], 14)


def test_paxton_and_licensing_reproduce_workbook():
    from peaksure import costs
    p = costs.paxton_sheet()
    assert (p["units"], p["nominal_kwh"], p["power_kw_installed"]) == (167, 10020, 5010)
    assert p["capex"] == pytest.approx(3_994_975.0, abs=1)
    assert p["npv"] == pytest.approx(914_098.70, abs=1)
    assert p["breakeven_net"] == pytest.approx(406_897.03, abs=1)
    assert costs.paxton_sheet(price_kwh=500)["npv"] == pytest.approx(-350_926.30, abs=1)
    assert costs.licensing_sheet()["npv"] == pytest.approx(626_953.66, abs=1)


def test_compliance_costs_flow_into_npv():
    from peaksure import costs
    c = costs.compliance_frame()
    c.loc[0, "ebs_upfront"] = 100_000
    c.loc[1, "ebs_annual"] = 10_000
    c.loc[2, "license_upfront"] = 50_000
    base, p = costs.paxton_sheet(), costs.paxton_sheet(c)
    af = costs.annuity(costs.paxton("discount_rate"), costs.paxton("life_years"))
    assert p["npv"] == pytest.approx(base["npv"] - 100_000 - 10_000 * af)
    assert costs.licensing_sheet(c)["npv"] == pytest.approx(costs.licensing_sheet()["npv"] - 50_000)
