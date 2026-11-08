from peaksure.config import CES_PROFILE, Config, DERIVED, REON_CLAIM, UNKNOWN, ASSUMED, SYSTEM_FLAGS


def test_ces_profile_keeps_claims_and_unknowns_separate():
    assert CES_PROFILE["rated_power_kw"]["status"] == REON_CLAIM
    assert CES_PROFILE["rated_energy_kwh"]["status"] == REON_CLAIM
    assert CES_PROFILE["rated_duration_h"]["status"] == DERIVED
    assert CES_PROFILE["rated_duration_h"]["value"] == (
        CES_PROFILE["rated_energy_kwh"]["value"] / CES_PROFILE["rated_power_kw"]["value"]
    )
    assert CES_PROFILE["ac_interface"]["status"] == REON_CLAIM
    for key in ("chemistry", "cell_dc_topology", "switch_loss"):
        assert CES_PROFILE[key]["status"] == UNKNOWN
        assert CES_PROFILE[key]["value"] is None
    assert SYSTEM_FLAGS["chemistry"][0] == ASSUMED
    assert SYSTEM_FLAGS["dc_window"][0] == UNKNOWN
    assert Config().n_min == round(Config().n_series * (1 - Config().headroom))
