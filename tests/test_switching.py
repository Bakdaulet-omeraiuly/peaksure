import numpy as np

from peaksure.config import Config
from peaksure import switching as sw


def test_switch_loss_formula_round_trips():
    cfg = Config()
    r = sw.ron_for_switch_loss(cfg, 0.02)
    assert np.isclose(sw.switch_loss_from_ron(cfg, r), 0.02)


def test_more_strings_lower_current_and_loss():
    cfg = Config()
    assert np.isclose(sw.switch_loss_from_ron(cfg, 1e-3, 16) * 2, sw.switch_loss_from_ron(cfg, 1e-3, 8))


def test_bypass_transient_settles_far_below_one_minute():
    r = sw.simulate_bypass(sw.TransientParams(l_loop_h=20e-6, c_link_f=10e-3))
    assert r["ok"]
    assert r["settle_ms"] < 10.0                       # model step is 60 s
    assert np.isclose(r["v_step_pct"], 100 / 240, rtol=0.1)   # one of 240 cells leaves


def test_new_steady_state_carries_the_same_power():
    p = sw.TransientParams()
    r = sw.simulate_bypass(p)
    assert np.isclose(r["i1_a"] * r["v1_v"], p.p_w, rtol=1e-9)
    assert r["i1_a"] > r["i0_a"]


def test_switching_energy_is_negligible_per_discharge():
    o = sw.main()
    assert o["switching_energy"]["share_of_rated_energy"] < 1e-6
