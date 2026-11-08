from peaksure.validation import ValidationCase, run_validation


def test_validation_report_separates_software_evidence_from_hardware_readiness():
    report = run_validation(seeds=1, years=1, cases=(ValidationCase("smoke", {}),))
    gates = {g["id"]: g for g in report["gates"]}
    assert gates["software_invariants"]["status"] == "PASS"
    assert gates["paired_comparison"]["status"] == "PASS"
    assert gates["determinism"]["status"] == "PASS"
    assert gates["reon_product_parameters"]["status"] == "BLOCKED"
    assert gates["held_out_hardware_validation"]["status"] == "BLOCKED"
    assert report["deployment_ready"] is False
    assert {row["cond"] for row in report["scenarios"]} == {"A", "B", "C_raw", "C"}
