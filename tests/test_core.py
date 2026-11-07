import numpy as np
import pytest

from peaksure import physics as ph
from peaksure.config import Config, NA_ION
from peaksure.decision import Decision, optimize, outcome, fixed_rule
from peaksure.data import HE_GRID, hour_forecast, peak_events
from peaksure.twin import CellTwin
from peaksure.sim import simulate


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


def test_zero_twin_error_perfect_info_dominates_twin():
    cfg = Config(years=2)
    p = simulate(cfg, "C_perf", 0)["events"].exp_kw.mean()
    assert p > 0
