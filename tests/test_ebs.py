from dataclasses import replace

from peaksure.ebs import EBSCase, population, simulate


def test_ebs_bypass_uses_same_cells_and_respects_voltage_floor():
    case = EBSCase(blocks=4, seed=7, r_on_ohm=0)
    q = population(case)
    fixed = simulate(case, q, False)
    bypass = simulate(case, q, True)
    assert bypass["energy_kwh"] > fixed["energy_kwh"]
    assert bypass["bypassed_cells"] == case.blocks
    assert bypass["energy_kwh"] <= case.blocks * 60 * case.eta
    assert bypass["full_power_minutes"] > fixed["full_power_minutes"]

    # A 120-cell block cannot directly meet a 750 V input floor at this chemistry.
    direct = simulate(replace(case, dc_floor_v=750), q, True)
    assert direct["energy_kwh"] == 0
    assert direct["checkpoints"]["0"]["blocks_online"] == 0


def test_ebs_loss_and_no_weak_cell_controls():
    case = EBSCase(blocks=4, seed=7)
    q = population(case)
    low_loss = simulate(replace(case, r_on_ohm=0), q, True)
    high_loss = simulate(replace(case, r_on_ohm=0.002), q, True)
    assert high_loss["energy_kwh"] <= low_loss["energy_kwh"]
    no_weak = replace(case, weak_factor=1)
    healthy = simulate(no_weak, population(no_weak), False)
    assert healthy["energy_kwh"] > simulate(case, q, False)["energy_kwh"]
