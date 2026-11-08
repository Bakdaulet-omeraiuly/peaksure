"""EBS C&I scenario: separate from CES, honest labels, consistent quantities, belief before truth."""
from dataclasses import replace

import numpy as np
import pytest

from peaksure import products as P
from peaksure.config import Config
from peaksure.ebs import EBSCase, simulate
from peaksure.ebs_scenario import (FLAGS, Scenario, belief_samples, commit, commitment_status, estimate, run_case,
                                   true_cells)

FAST = Scenario(belief_samples=40)


def test_ebs_is_separate_from_ces_and_mlp_plant():
    assert P.EBS_NA is not P.CES
    assert P.EBS_NA.get("rated_power_kw").value == 30 and P.CES.get("rated_power_kw").value == 2500
    assert Scenario().rated_kw == 30 and Config().p_max_kw == 2500       # EBS scenario does not reuse plant size
    assert P.CES.get("cell_level_bypass").value is False


def test_na_and_li_do_not_share_chemistry_specific_claims():
    for k in ("cycle_life", "operating_temp"):
        assert k in P.EBS_NA.specs and k not in P.EBS_LI.specs
    li = P.EBS_LI.get("rated_energy_kwh")
    assert li.status == P.REON_CLAIM and not isinstance(li.value, (int, float))   # claim, not a model input
    assert P.EBS_LI.get("rated_power_kw").status == P.UNKNOWN
    assert P.EBS_NA.get("chemistry").value == "sodium-ion"


def test_flags_and_nominal_ratio_are_labelled():
    for status, _ in FLAGS.values():
        assert status in P.STATUSES
    r = P.EBS_NA.get("nominal_ratio_h")
    assert r.status == P.DERIVED and r.value == pytest.approx(60 / 30)
    assert FLAGS["nominal_ratio_h"][0] == "DERIVED" and FLAGS["li_ion"][0] == "UNKNOWN"


def test_commitment_energy_and_feasibility():
    case = run_case(0.8, 2, FAST)
    for hw in ("fixed", "bypass"):
        c = case[hw]
        assert c["commit_energy_kwh"] == pytest.approx(c["commit_kw"] * 2)
        assert c["commit_kw"] <= 30 and c["chance"] >= 0.95
        o = c["outcome"]
        assert o["fulfilled"] == (o["delivered_kwh"] >= c["commit_energy_kwh"] - 1e-6)
    # 30 kW for 3 h = 90 kWh cannot fit a 60 kWh rating at 96% efficiency
    assert commitment_status(30, 3, 200, 30, 60, 0.96) == "exceeds-rated"
    assert commitment_status(30, 2, 50, 30, 60, 0.96) == "exceeds-rated"
    assert commitment_status(25, 2, 49, 30, 60, 0.96) == "exceeds-belief"
    assert commitment_status(20, 2, 49, 30, 60, 0.96) == "feasible"


def test_decision_sees_belief_not_truth():
    base = EBSCase(weak_factor=0.8)
    q = true_cells(base)
    mean, sd = estimate(q, FAST)
    s = belief_samples(mean, sd, FAST)
    kw, _ = commit(base, s, True, 2, FAST)
    # same belief, different hidden plant: the commitment cannot change
    assert commit(base, s, True, 2, FAST)[0] == kw
    case = run_case(0.8, 2, FAST)
    assert case["diagnosis_cell"] == int(np.argmin(mean))       # diagnosis chosen from the twin estimate


def test_both_batteries_start_from_identical_cells():
    case = run_case(1.0, 2, FAST)
    f0, b0 = case["fixed"]["outcome"]["trace"][0], case["bypass"]["outcome"]["trace"][0]
    assert f0["soc_b64"] == b0["soc_b64"] and f0["active_b64"] == b0["active_b64"]


def test_bypass_without_headroom_or_loss_equals_fixed():
    base = replace(EBSCase(weak_factor=0.8, r_on_ohm=0.0), n_min=EBSCase().cells_per_block, blocks=1)
    q = true_cells(base)[None, :]
    assert simulate(base, q, True)["energy_kwh"] == pytest.approx(simulate(base, q, False)["energy_kwh"])


def test_fixed_limit_is_reported_from_engine_state():
    case = run_case(0.8, 2, FAST)
    d = case["fixed"]["drain"]
    assert "empty cell" in d["stop_reason"]
    assert d["stop_cell"] == case["true_weakest_cell"]          # the weak cell the engine emptied first
    healthy = run_case(1.0, 2, FAST)["fixed"]["drain"]
    if "empty cell" not in healthy["stop_reason"]:
        assert healthy["stop_cell"] is None                       # no limiting cell is invented
