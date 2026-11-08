# PeakSure Validation Report

24 seeds × 5 years × 7 scenarios. Software evidence uses simulated truth; it is not REON hardware validation.

**Software validation ready:** True  
**Deployment ready:** False

## Acceptance gates

| Gate | Status | Criterion | Evidence |
|---|---|---|---|
| software_invariants | PASS | Finite outputs and physical commitment bounds in every case | 0 failures |
| paired_comparison | PASS | A/B/raw/C use identical peak events for every seed | 0 mismatches |
| determinism | PASS | Repeated C run is exactly reproducible | True |
| simulated_p5_safety | PASS | Guarded PeakSure P5 miss <= 5% in every simulated case | worst observed 2.08% |
| simulated_delivery | PASS | At least 95% of nonzero commitments fully delivered in every simulated case | worst observed 99.51% |
| reon_product_parameters | BLOCKED | REON topology, chemistry, DC window and switch path measured and versioned | Public CES/CESS internals remain UNKNOWN |
| held_out_hardware_validation | BLOCKED | Locked model passes held-out pack, HIL and fault-injection tests | No REON hardware dataset or HIL result supplied |
| safety_certification | BLOCKED | Applicable UL/IEC/NFPA product and installation evidence reviewed | Simulation cannot establish certification or installation safety |

## Scenario matrix

| Scenario | Condition | Events | P5 miss | Full-delivery reliability | Mean commitment kW |
|---|---|---:|---:|---:|---:|
| base_2h | A | 1440 | 3.12% | 100.00% | 2500.0 |
| base_2h | B | 1440 | 0.35% | 100.00% | 2500.0 |
| base_2h | C | 1440 | 0.00% | 100.00% | 2202.7 |
| base_2h | C_raw | 1440 | 9.38% | 99.44% | 2190.3 |
| cell_faults | A | 1440 | 83.75% | 22.92% | 2500.0 |
| cell_faults | B | 1440 | 0.35% | 100.00% | 2500.0 |
| cell_faults | C | 1440 | 0.00% | 100.00% | 2203.2 |
| cell_faults | C_raw | 1440 | 8.96% | 99.31% | 2189.3 |
| duration_1h | A | 1440 | 3.33% | 96.67% | 2014.5 |
| duration_1h | B | 1440 | 0.35% | 99.65% | 2090.8 |
| duration_1h | C | 1440 | 0.00% | 100.00% | 2042.0 |
| duration_1h | C_raw | 1440 | 9.51% | 99.72% | 2149.4 |
| duration_4h | A | 1440 | 3.19% | 100.00% | 2500.0 |
| duration_4h | B | 1440 | 0.35% | 100.00% | 2500.0 |
| duration_4h | C | 1440 | 0.00% | 100.00% | 2500.0 |
| duration_4h | C_raw | 1440 | 8.54% | 100.00% | 2500.0 |
| random_sensor_noise | A | 1440 | 3.12% | 100.00% | 2500.0 |
| random_sensor_noise | B | 1440 | 0.35% | 100.00% | 2500.0 |
| random_sensor_noise | C | 1440 | 0.00% | 100.00% | 2200.4 |
| random_sensor_noise | C_raw | 1440 | 0.69% | 100.00% | 2185.4 |
| systematic_sensor_bias | A | 1440 | 3.12% | 100.00% | 2500.0 |
| systematic_sensor_bias | B | 1440 | 0.35% | 100.00% | 2500.0 |
| systematic_sensor_bias | C | 1440 | 0.14% | 99.93% | 2203.1 |
| systematic_sensor_bias | C_raw | 1440 | 84.44% | 71.81% | 2206.1 |
| weak_cooling | A | 1440 | 35.21% | 54.65% | 2200.6 |
| weak_cooling | B | 1440 | 19.65% | 94.51% | 2217.6 |
| weak_cooling | C | 1440 | 2.08% | 99.51% | 2337.4 |
| weak_cooling | C_raw | 1440 | 3.33% | 99.17% | 2321.9 |

## Required REON evidence before field deployment

1. Versioned cell/module/string topology, DC operating window, switch resistance and failure modes.
2. Time-synchronized cell voltage, current, temperature, switch state and AC power/energy data.
3. Held-out pack and calendar periods never used for fitting or threshold selection.
4. Hardware-in-the-loop tests for sensor drift/dropout, stuck switches, contactor faults, thermal spread and communications loss.
5. Independent safety/certification review; software simulation is not a substitute.
