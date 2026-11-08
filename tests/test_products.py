"""Product profiles stay separate, statuses are honest, commitments are physically consistent."""
import numpy as np
import pytest

from peaksure import products as P
from peaksure.config import Config, SYSTEM_FLAGS
from peaksure.data import HE_GRID
from peaksure.decision import Decision, commitment_status, fixed_rule, optimize


def test_ces_and_ebs_profiles_are_separate_objects():
    assert P.CES is not P.EBS_NA and P.CES.specs is not P.EBS_NA.specs
    assert P.CES.get("rated_power_kw").value == 2500 and P.EBS_NA.get("rated_power_kw").value == 30


def test_ebs_only_specs_not_applied_to_ces():
    for k in ("chemistry", "cells_per_string", "n_min", "dc_window_v", "switch_r_on", "round_trip_eff",
              "parallel_columns", "cell_format"):
        assert P.CES.get(k).status == P.UNKNOWN, k
    assert "cycle_life" not in P.CES.specs and "operating_temp" not in P.CES.specs
    assert P.CES.get("cell_level_bypass").value is False


def test_statuses_are_valid_and_sourced():
    for prod in (*P.PRODUCTS.values(), P.MODEL_PLANT):
        for k in P.PARAMS:
            s = prod.get(k)
            assert s.status in P.STATUSES
            if s.status in (P.CONFIRMED, P.REON_CLAIM, P.LITERATURE):
                assert s.source
            if s.status == P.DERIVED:
                assert s.note
    with pytest.raises(ValueError):
        P.Spec(1, "MAYBE")
    with pytest.raises(ValueError):
        P.Spec(1, P.DERIVED)                      # derived without a calculation


def test_model_plant_is_not_labelled_as_reon_spec():
    for k in ("cells_per_string", "parallel_columns", "round_trip_eff"):
        assert P.MODEL_PLANT.get(k).status == P.ASSUMED
    assert P.MODEL_PLANT.get("n_min").status == P.DERIVED
    assert SYSTEM_FLAGS["p_max_kw"][0] == "ASSUMED" and SYSTEM_FLAGS["e_nom_kwh"][0] == "ASSUMED"
    cfg = Config()
    assert round(cfg.n_series * (1 - cfg.headroom)) == P.MODEL_PLANT.get("n_min").value
    assert P.MODEL_PLANT.get("cells_per_string").value == cfg.n_series


def test_commitment_energy_is_power_times_duration():
    d = Decision(17, 3, 1234.5, 0.0)
    assert d.energy_kwh == pytest.approx(1234.5 * 3)


def test_infeasible_commitments_flagged():
    # 2.5 MW for 3 h = 7.5 MWh cannot fit a 5 MWh nameplate profile
    assert commitment_status(Decision(16, 3, 2500, 0), 9000, 2500, 5000, 0.96) == "exceeds-rated"
    assert commitment_status(Decision(18, 1, 2500, 0), 2000, 2500, 5000, 0.96) == "exceeds-belief"
    assert commitment_status(Decision(18, 1, 2500, 0), 3600, 2500, 5000, 0.96) == "feasible"
    assert commitment_status(Decision(18, 1, 0, 0), 3600, 2500, 5000, 0.96) == "no-commitment"


def test_decision_rules_never_exceed_belief_or_rating():
    rng = np.random.default_rng(0)
    p_hour = np.full(len(HE_GRID), 1 / len(HE_GRID))
    for e_nom in (2500, 5000, 10000):
        samples = rng.normal(0.85 * e_nom, 0.03 * e_nom, 128)
        for dec in (optimize(samples, 2500, p_hour), fixed_rule(float(np.percentile(samples, 5)), 2500, p_hour)):
            st = commitment_status(dec, float(np.percentile(samples, 5)) + 1e-6 * e_nom, 2500, e_nom, 0.96)
            assert st == "feasible", (e_nom, dec)
            assert 1 <= dec.window_h <= 6 and dec.start_he in HE_GRID      # HE is a time, window a duration


def test_use_case_is_labelled_as_modelled_not_deployment():
    assert P.USE_CASE["status"] == P.ASSUMED and "not evidence" in P.USE_CASE["note"]
