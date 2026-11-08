"""Reproducible deployment-readiness validation for the PeakSure decision model.

This validates software invariants and simulated statistical coverage.  It deliberately keeps
hardware readiness BLOCKED until REON supplies the product topology and held-out test data.

    python -m peaksure.validation --quick
    python -m peaksure.validation
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, replace
import json
from pathlib import Path

import numpy as np
import pandas as pd

from . import econ
from .config import CHEMISTRIES, CES_PROFILE, Config, NA_ION, UNKNOWN
from .sim import simulate

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "results"


@dataclass(frozen=True)
class ValidationCase:
    name: str
    overrides: dict
    chemistry_overrides: dict | None = None
    purpose: str = ""


CASES = (
    ValidationCase("base_2h", {}, purpose="Nominal two-hour CES-sized model"),
    ValidationCase("duration_1h", {"e_nom_kwh": 2500.0}, purpose="Power-limited short-duration system"),
    ValidationCase("duration_4h", {"e_nom_kwh": 10000.0}, purpose="Energy-limited long-duration system"),
    ValidationCase("weak_cooling", {"k_hvac": 0.9, "sigma_t_cell": 6.0}, purpose="High thermal spread and weak HVAC"),
    ValidationCase("random_sensor_noise", {"sigma_meas": 0.04}, purpose="Noisy per-cell capacity estimates"),
    ValidationCase("systematic_sensor_bias", {"meas_bias": 0.01, "trend_bias": 0.10}, purpose="Common directional twin error"),
    ValidationCase("cell_faults", {}, {"fault_hazard_yr": 0.002}, purpose="Synthetic per-cell fault stress"),
)


def _config(case: ValidationCase, years: int) -> Config:
    cfg = Config(years=years).with_(**case.overrides)
    if case.chemistry_overrides:
        name = f"Na-ion:validation:{case.name}"
        CHEMISTRIES[name] = replace(NA_ION, **case.chemistry_overrides)
        cfg = cfg.with_(chemistry=name)
    return cfg


def _finite_frame(df: pd.DataFrame) -> bool:
    cols = ["d_true", "d_p5", "d_p50", "d_p95", "p_true", "power_kw", "shaved_kw"]
    return bool(np.isfinite(df[cols].to_numpy(float)).all())


def run_validation(*, seeds: int = 24, years: int = 5,
                   cases: tuple[ValidationCase, ...] = CASES) -> dict:
    rows: list[dict] = []
    invariant_failures: list[str] = []
    pairing_failures: list[str] = []
    deterministic = True
    conditions = ("A", "B", "C_raw", "C")

    for case in cases:
        cfg = _config(case, years)
        by_seed: dict[int, dict[str, pd.DataFrame]] = {}
        for seed in range(seeds):
            by_seed[seed] = {}
            for cond in conditions:
                ev = simulate(cfg, cond, seed)["events"]
                by_seed[seed][cond] = ev
                if not _finite_frame(ev):
                    invariant_failures.append(f"{case.name}/{seed}/{cond}: non-finite output")
                if not ((ev.power_kw >= 0) & (ev.power_kw <= cfg.p_max_kw + 1e-8)).all():
                    invariant_failures.append(f"{case.name}/{seed}/{cond}: commitment outside power bounds")
                if not ((ev.window_h >= 1) & (ev.window_h <= 6)).all():
                    invariant_failures.append(f"{case.name}/{seed}/{cond}: invalid commitment window")
                committed = ev[ev.power_kw > 0]
                rows.append(dict(
                    scenario=case.name, purpose=case.purpose, cond=cond, seed=seed,
                    events=len(ev), commitments=len(committed),
                    p5_misses=int((ev.d_true < ev.d_p5).sum()),
                    delivered_full=int(committed.delivered_full.sum()),
                    mean_commit_kw=float(ev.power_kw.mean()),
                    mean_shaved_kw=float(ev.shaved_kw.mean()),
                ))
            reference = by_seed[seed]["A"]
            for cond in conditions[1:]:
                other = by_seed[seed][cond]
                for col in ("m", "src_year", "peak_he"):
                    if not np.array_equal(reference[col].to_numpy(), other[col].to_numpy()):
                        pairing_failures.append(f"{case.name}/{seed}: A and {cond} differ in {col}")
        # Repeat one complete run byte-for-byte at every case boundary.
        a = simulate(cfg, "C", 0)["events"]
        b = simulate(cfg, "C", 0)["events"]
        deterministic &= a.equals(b)

    detail = pd.DataFrame(rows)
    summary: list[dict] = []
    for (scenario, cond), g in detail.groupby(["scenario", "cond"]):
        n, misses = int(g.events.sum()), int(g.p5_misses.sum())
        miss, miss_lo, miss_hi = econ.wilson(misses, n)
        commitments, delivered = int(g.commitments.sum()), int(g.delivered_full.sum())
        reliability, rel_lo, rel_hi = econ.wilson(delivered, commitments) if commitments else (1.0, 1.0, 1.0)
        summary.append(dict(
            scenario=scenario, cond=cond, events=n, commitments=commitments,
            p5_miss=miss, p5_miss_lo=miss_lo, p5_miss_hi=miss_hi,
            delivery_reliability=reliability, delivery_lo=rel_lo, delivery_hi=rel_hi,
            mean_commit_kw=float(np.average(g.mean_commit_kw, weights=g.events)),
            mean_shaved_kw=float(np.average(g.mean_shaved_kw, weights=g.events)),
        ))

    s = pd.DataFrame(summary)
    guarded = s[s.cond == "C"]
    gates = [
        dict(id="software_invariants", status="PASS" if not invariant_failures else "FAIL",
             criterion="Finite outputs and physical commitment bounds in every case",
             evidence=f"{len(invariant_failures)} failures"),
        dict(id="paired_comparison", status="PASS" if not pairing_failures else "FAIL",
             criterion="A/B/raw/C use identical peak events for every seed",
             evidence=f"{len(pairing_failures)} mismatches"),
        dict(id="determinism", status="PASS" if deterministic else "FAIL",
             criterion="Repeated C run is exactly reproducible", evidence=str(deterministic)),
        dict(id="simulated_p5_safety", status="PASS" if (guarded.p5_miss <= 0.05).all() else "FAIL",
             criterion="Guarded PeakSure P5 miss <= 5% in every simulated case",
             evidence=f"worst observed {guarded.p5_miss.max() * 100:.2f}%"),
        dict(id="simulated_delivery", status="PASS" if (guarded.delivery_reliability >= 0.95).all() else "FAIL",
             criterion="At least 95% of nonzero commitments fully delivered in every simulated case",
             evidence=f"worst observed {guarded.delivery_reliability.min() * 100:.2f}%"),
        dict(id="reon_product_parameters", status="BLOCKED",
             criterion="REON topology, chemistry, DC window and switch path measured and versioned",
             evidence="Public CES/CESS internals remain UNKNOWN"),
        dict(id="held_out_hardware_validation", status="BLOCKED",
             criterion="Locked model passes held-out pack, HIL and fault-injection tests",
             evidence="No REON hardware dataset or HIL result supplied"),
        dict(id="safety_certification", status="BLOCKED",
             criterion="Applicable UL/IEC/NFPA product and installation evidence reviewed",
             evidence="Simulation cannot establish certification or installation safety"),
    ]
    software_ready = all(g["status"] == "PASS" for g in gates if g["status"] != "BLOCKED")
    deployment_ready = all(g["status"] == "PASS" for g in gates)
    return dict(
        schema_version=1, seeds=seeds, years=years, cases=len(cases),
        software_validation_ready=software_ready, deployment_ready=deployment_ready,
        product_unknowns={k: v for k, v in CES_PROFILE.items()
                          if isinstance(v, dict) and v.get("status") == UNKNOWN},
        gates=gates, scenarios=summary,
        failures={"invariants": invariant_failures, "pairing": pairing_failures},
    )


def write_report(report: dict) -> None:
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "validation_report.json").write_text(json.dumps(report, indent=2))
    lines = [
        "# PeakSure Validation Report", "",
        f"{report['seeds']} seeds × {report['years']} years × {report['cases']} scenarios. "
        "Software evidence uses simulated truth; it is not REON hardware validation.", "",
        f"**Software validation ready:** {report['software_validation_ready']}  ",
        f"**Deployment ready:** {report['deployment_ready']}", "",
        "## Acceptance gates", "",
        "| Gate | Status | Criterion | Evidence |", "|---|---|---|---|",
    ]
    for gate in report["gates"]:
        lines.append(f"| {gate['id']} | {gate['status']} | {gate['criterion']} | {gate['evidence']} |")
    lines += ["", "## Scenario matrix", "",
              "| Scenario | Condition | Events | P5 miss | Full-delivery reliability | Mean commitment kW |",
              "|---|---|---:|---:|---:|---:|"]
    for row in report["scenarios"]:
        lines.append(f"| {row['scenario']} | {row['cond']} | {row['events']} | "
                     f"{row['p5_miss'] * 100:.2f}% | {row['delivery_reliability'] * 100:.2f}% | "
                     f"{row['mean_commit_kw']:.1f} |")
    lines += ["", "## Required REON evidence before field deployment", "",
              "1. Versioned cell/module/string topology, DC operating window, switch resistance and failure modes.",
              "2. Time-synchronized cell voltage, current, temperature, switch state and AC power/energy data.",
              "3. Held-out pack and calendar periods never used for fitting or threshold selection.",
              "4. Hardware-in-the-loop tests for sensor drift/dropout, stuck switches, contactor faults, thermal spread and communications loss.",
              "5. Independent safety/certification review; software simulation is not a substitute.", ""]
    (ROOT / "VALIDATION.md").write_text("\n".join(lines))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--seeds", type=int)
    parser.add_argument("--years", type=int)
    args = parser.parse_args(argv)
    seeds = args.seeds or (3 if args.quick else 24)
    years = args.years or (2 if args.quick else 5)
    report = run_validation(seeds=seeds, years=years)
    write_report(report)
    print(json.dumps({"software_validation_ready": report["software_validation_ready"],
                      "deployment_ready": report["deployment_ready"], "gates": report["gates"]}, indent=2))
    return 0 if report["software_validation_ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
