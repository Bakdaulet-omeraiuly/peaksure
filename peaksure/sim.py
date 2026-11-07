"""Monte Carlo simulation of one CES over the planning horizon, for one experimental condition.

Ground truth (`q`, `m`, temperatures, faults) and belief (`CellTwin` / `PackEstimator`) are
separate objects; decisions only ever see the belief. Random streams are keyed by
(seed, month, stream) so that every condition sees identical cell populations, weather,
peak events and measurement noise (common random numbers).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from . import physics as ph
from .config import Config
from .data import HE_GRID, MONTH_MEAN_C, hour_forecast, sample_event_sequence
from .decision import Decision, fixed_rule, optimize, outcome
from .twin import CellTwin, PackEstimator

CONDITIONS = {
    "A":      dict(tier="fixed",  info="pack",    rule="fixed"),
    "A_opt":  dict(tier="fixed",  info="pack",    rule="opt"),
    "A_twin": dict(tier="fixed",  info="twin",    rule="opt"),
    "A_perf": dict(tier="fixed",  info="perfect", rule="opt"),
    "B":      dict(tier="bypass", info="pack",    rule="fixed"),
    "B_opt":  dict(tier="bypass", info="pack",    rule="opt"),
    "C":      dict(tier="bypass", info="twin",    rule="opt"),
    "C_perf": dict(tier="bypass", info="perfect", rule="opt"),
    "D":      dict(tier="bypass", info="twin",    rule="opt", probe="voi"),
    "D_rr":   dict(tier="bypass", info="twin",    rule="opt", probe="rr"),
    "D_rand": dict(tier="bypass", info="twin",    rule="opt", probe="random"),
    "C_T3":   dict(tier="bypass", info="twin",    rule="opt", tier3=True),
}

LABELS = {
    "A": "A  Conventional (fixed string, pack estimate, fixed rule)",
    "B": "B  REON bypass, no predictive intelligence",
    "C": "C  PeakSure: bypass + cell twin + optimized commitment",
    "D": "D  PeakSure + VoI diagnostic probes",
    "C_T3": "C + Tier 3 lifetime-aware resting SOC",
}

S_POP, S_SEQ, S_MEAS, S_FORE, S_SAMP, S_PROBE, S_TEST, S_FAULT, S_RAND, S_NEW = range(10)


def _rng(seed: int, month: int, stream: int, extra: int = 0) -> np.random.Generator:
    return np.random.default_rng([seed, month + 1, stream, extra])


def nominal_fade_month(cfg: Config) -> float:
    """Median-cell fade per month implied by the ageing model (used as the estimators' prior)."""
    ch = cfg.chem
    efc_yr = (4 * cfg.dispatch_days_summer + 8 * cfg.dispatch_days_other) * 0.5
    total = ch.cal_a * np.sqrt(cfg.years) + ch.cyc_b * efc_yr * cfg.years
    return total / (cfg.years * 12)


@dataclass
class Population:
    q0: np.ndarray
    m: np.ndarray
    z_r: np.ndarray
    t_off: np.ndarray


def draw_population(cfg: Config, seed: int) -> Population:
    ch, rng = cfg.chem, _rng(seed, -1, S_POP)
    shape = (cfg.n_strings, cfg.n_series)
    z_c, z_r, z_i = (rng.standard_normal(shape) for _ in range(3))
    q0 = cfg.q_nom_ah * (1 + ch.cap_cov * z_c)
    z_m = ch.rho_r_aging * z_r + np.sqrt(1 - ch.rho_r_aging ** 2) * z_i
    m = np.exp(ch.aging_sigma * z_m)
    t_off = cfg.sigma_t_cell * rng.standard_normal(shape)
    return Population(q0, m, z_r, t_off)


def simulate(cfg: Config, cond: str, seed: int, snapshots: bool = False,
             capture_month: int | None = None, override: dict | None = None,
             snap_months: tuple | None = None) -> dict:
    """Run one condition. If capture_month is given, the simulation stops after that month's
    peak event and returns a detailed 'capture' of cell states, beliefs and the decision
    (used by the live demo). `override` replaces that month's event (he, t_amb_c, is_annual,
    src_year) with a chosen historical peak."""
    spec = CONDITIONS[cond]
    tier, info, rule = spec["tier"], spec["info"], spec["rule"]
    probe, tier3 = spec.get("probe", "none"), spec.get("tier3", False)
    ch = cfg.chem
    S, N, qn, v = cfg.n_strings, cfg.n_series, cfg.q_nom_ah, ch.v_nom
    p_str = cfg.p_max_kw / S
    phys = dict(v_nom=v, n_min=cfg.n_min, chem=ch, eta=cfg.eta_discharge, switch_loss=cfg.switch_loss)

    pop = draw_population(cfg, seed)
    q, m, z_r = pop.q0.copy(), pop.m.copy(), pop.z_r.copy()
    age = np.zeros_like(q)
    faulted = np.zeros(q.shape, bool)
    seq = sample_event_sequence(_rng(seed, -1, S_SEQ), cfg.years)
    fade_m = nominal_fade_month(cfg)
    prior_trend = -fade_m * qn * (1 - cfg.trend_bias)

    meas0 = q * (1 + cfg.meas_bias) + cfg.sigma_meas * qn * _rng(seed, 0, S_MEAS).standard_normal(q.shape)
    twin = CellTwin(meas0, qn, cfg.sigma_meas, prior_trend, abs(prior_trend),
                    0.001 * qn, 0.00005 * qn)

    def d_ref_strings(qq):
        return ph.deliverable(qq, tier=tier, soc0=np.ones_like(qq), t_cell=np.full_like(qq, 25.0),
                              p_string_max=p_str, faulted=faulted, **phys)[0]

    pack = PackEstimator(d_ref_strings(q), cfg.sigma_pack_test, fade_m, _rng(seed, 0, S_TEST))
    rr_ptr = 0
    events, monthly, snaps = [], [], {}
    n_months = cfg.years * 12

    for mi in range(n_months):
        yr, mo = mi // 12, mi % 12 + 1
        ev = seq[(seq.sim_year == yr) & (seq.month == mo)].iloc[0]
        capturing = capture_month is not None and mi == capture_month
        if capturing and override:
            ev = ev.copy()
            for k_, v_ in override.items():
                ev[k_] = v_
        p_hour = hour_forecast(mo, exclude_year=int(ev.src_year))

        # ---------------- peak event: forecast, belief, (probes), decision, truth
        # day-ahead temperature forecast; the belief samples the forecast error (K samples)
        rf = _rng(seed, mi, S_FORE)
        t_fore = ev.t_amb_c + cfg.forecast_temp_sd * rf.standard_normal()
        t_amb_s = t_fore + cfg.forecast_temp_sd * rf.standard_normal(cfg.twin_samples)
        t_cont_s = ph.container_temp(t_amb_s, cfg.t_hvac_set, cfg.k_hvac)[:, None, None]
        t_cell_f = t_cont_s + pop.t_off[None] + cfg.load_heating_c            # (K,S,N)
        soc0_f = np.broadcast_to(np.where(t_cont_s >= ch.t_charge_min, 1.0, 0.7), t_cell_f.shape)
        t_cont = ph.container_temp(ev.t_amb_c, cfg.t_hvac_set, cfg.k_hvac)
        t_cell = t_cont + pop.t_off + cfg.load_heating_c
        soc0 = np.full_like(q, 1.0 if t_cont >= ch.t_charge_min else 0.7)

        n_probes, voi_gain, probed, d_pre = 0, 0.0, [], None
        if info == "perfect":
            e_true, p_true = ph.deliverable(q, tier=tier, soc0=soc0, t_cell=t_cell,
                                            p_string_max=p_str, faulted=faulted, **phys)
            d_samp, p_av = np.array([e_true.sum()]), float(p_true.sum())
        elif info == "pack":
            tf = (ph.cold_capacity_factor(t_cell_f.mean(axis=(1, 2)), ch.cold_slope)
                  * soc0_f.mean(axis=(1, 2)))                                  # per sample
            d_samp = pack.belief(1.0, cfg.twin_samples, _rng(seed, mi, S_SAMP)) * tf
            p_av = float(np.median((p_str * ph.fixed_string_power_derate(
                t_cell_f.max(axis=-1), ch.t_derate, ch.t_max)).sum(axis=-1)))
        else:
            if capturing:
                d_pre, _ = _twin_belief(twin, cfg, soc0_f, t_cell_f, faulted, tier, phys, p_str,
                                        _rng(seed, mi, S_SAMP))
            if probe != "none" and cfg.probe_budget > 0:
                rr_ptr, n_probes, voi_gain, probed = _run_probes(
                    probe, cfg, twin, q, faulted, soc0_f, t_cell_f, p_hour, phys, p_str,
                    seed, mi, rr_ptr, tier)
            d_samp, p_av = _twin_belief(twin, cfg, soc0_f, t_cell_f, faulted, tier, phys, p_str,
                                        _rng(seed, mi, S_SAMP))

        dec = (optimize(d_samp, p_av, p_hour, cfg.alpha) if rule == "opt"
               else fixed_rule(float(np.percentile(d_samp, 5)), p_av, p_hour))
        e_true, p_true = ph.deliverable(q, tier=tier, soc0=soc0, t_cell=t_cell,
                                        p_string_max=p_str, faulted=faulted, **phys)
        d_true = float(e_true.sum()) - n_probes * cfg.probe_energy_kwh
        shaved, e_used, success = outcome(dec, int(ev.he), d_true, float(p_true.sum()))
        events.append(dict(
            cond=cond, run=seed, m=mi, sim_year=yr, month=mo, is_annual=bool(ev.is_annual),
            src_year=int(ev.src_year), t_amb_c=float(ev.t_amb_c), t_cell_max=float(t_cell.max()),
            peak_he=int(ev.he), start_he=dec.start_he, window_h=dec.window_h,
            power_kw=dec.power_kw, exp_kw=dec.exp_value_kw, d_true=d_true, p_true=float(p_true.sum()),
            d_p5=float(np.percentile(d_samp, 5)), d_p50=float(np.percentile(d_samp, 50)),
            d_p95=float(np.percentile(d_samp, 95)), shaved_kw=shaved, success=success,
            delivered_full=bool(dec.power_kw > 0 and min(dec.power_kw, float(p_true.sum())) * dec.window_h
                                <= d_true + 1e-9 and float(p_true.sum()) >= dec.power_kw - 1e-9),
            probes=n_probes, voi_gain_kw=voi_gain))

        if capturing:
            avail = q * soc0 * ph.cold_capacity_factor(t_cell, ch.cold_slope)
            hot = t_cell > ch.t_derate
            _, cutoff = ph.bypass_string_energy_ah(avail, cfg.n_min, hot | faulted)
            cap = dict(cond=cond, tier=tier, info=info, month=mi, sim_year=yr, cal_month=mo,
                       soh=q / qn, twin_mean=twin.x0 / qn, twin_sd=twin.sd / qn, t_cell=t_cell,
                       avail_rel=avail / qn, limiting=(avail == avail.min(axis=-1, keepdims=True)),
                       exhausted=(avail < cutoff[:, None]) & ~hot, hot=hot, cutoff_rel=cutoff / qn,
                       d_samp=np.asarray(d_samp), d_pre=None if d_pre is None else np.asarray(d_pre),
                       d_true=d_true, p_true=float(p_true.sum()), e_true_strings=e_true,
                       decision=dict(start_he=dec.start_he, window_h=dec.window_h,
                                     power_kw=dec.power_kw, exp_kw=dec.exp_value_kw),
                       shaved_kw=shaved, success=success, probed=probed, p_hour=p_hour,
                       peak_he=int(ev.he), t_amb_c=float(ev.t_amb_c), is_annual=bool(ev.is_annual),
                       n_min=cfg.n_min, n_series=N, n_strings=S)
            return dict(events=pd.DataFrame(events), capture=cap)

        # ---------------- cycle ageing from dispatch days (same energy each candidate day)
        n_disp = cfg.dispatch_days_summer if mo in (6, 7, 8, 9) else cfg.dispatch_days_other
        if e_used > 0 and e_true.sum() > 0:
            e_s = e_used * e_true / e_true.sum()
            if tier == "fixed":
                ah_cell = e_s * 1000 / (cfg.eta_discharge * v * N)
                dod = np.clip(ah_cell[:, None] / np.maximum(q, 1e-6), 0, 1)
            else:
                active_q = np.where(faulted, 0.0, q).sum(axis=-1)
                dod = np.clip(e_s * 1000 / (cfg.eta_discharge * v * np.maximum(active_q, 1e-6)), 0, 1)
                dod = np.broadcast_to(dod[:, None], q.shape)
            dq_cyc = ch.cyc_b * m * dod * np.sqrt(dod / 0.8) * qn * n_disp
            q = q - np.where(faulted, 0.0, dq_cyc)

        # ---------------- calendar ageing for the month
        t_month = ph.container_temp(MONTH_MEAN_C[mo - 1], cfg.t_hvac_set, cfg.k_hvac) + pop.t_off
        if tier3:
            weak = twin.x0 <= np.quantile(twin.x0, cfg.tier3_weak_share, axis=-1, keepdims=True)
            frac_hi = min(1.0, (n_disp + 1) / 30.0)
            g = (frac_hi * ph.soc_stress(cfg.rest_soc, float(t_month.mean()), ch.beta_soc_25,
                                         ch.beta_soc_45, ch.low_soc_penalty)
                 + (1 - frac_hi) * ph.soc_stress(np.where(weak, cfg.tier3_rest_soc, cfg.rest_soc),
                                                 float(t_month.mean()), ch.beta_soc_25,
                                                 ch.beta_soc_45, ch.low_soc_penalty))
        else:
            g = ph.soc_stress(cfg.rest_soc, float(t_month.mean()), ch.beta_soc_25, ch.beta_soc_45,
                              ch.low_soc_penalty)
        dq_cal = ch.cal_a * m * ph.arrhenius(t_month, ch.ea_kj) * g * (np.sqrt(age + 1 / 12) - np.sqrt(age)) * qn
        q = np.maximum(q - dq_cal, 0.02 * qn)
        age = age + 1 / 12

        # ---------------- faults (scenario only; base hazard 0)
        if ch.fault_hazard_yr > 0:
            u = _rng(seed, mi, S_FAULT).random(q.shape)
            faulted |= u < ch.fault_hazard_yr / 12 * np.exp(z_r)

        # ---------------- measurements -> belief
        z = q * (1 + cfg.meas_bias) + cfg.sigma_meas * qn * _rng(seed, mi + 1, S_MEAS).standard_normal(q.shape)
        twin.predict()
        twin.update(z)
        pack.tick()

        # ---------------- annual maintenance (January): repairs, augmentation, capacity test
        aug_kwh, n_repl = 0.0, 0
        if mo == 12:
            rng_new = _rng(seed, mi, S_NEW)
            repl = faulted.copy()
            d_ref = d_ref_strings(q).sum()
            it = 0
            while d_ref < cfg.eol_retention * cfg.e_nom_kwh and it < 20:
                k = int(0.05 * q.size)
                flat = np.argsort(np.where(repl, np.inf, q), axis=None)[:k]
                repl.flat[flat] = True
                q_try = np.where(repl, qn, q)
                d_ref = ph.deliverable(q_try, tier=tier, soc0=np.ones_like(q), t_cell=np.full_like(q, 25.0),
                                       p_string_max=p_str, faulted=np.zeros_like(faulted), **phys)[0].sum()
                it += 1
            if repl.any():
                n_new = int(repl.sum())
                new_q = qn * (1 + ch.cap_cov * rng_new.standard_normal(n_new))
                zr_new = rng_new.standard_normal(n_new)
                zm_new = ch.rho_r_aging * zr_new + np.sqrt(1 - ch.rho_r_aging ** 2) * rng_new.standard_normal(n_new)
                q[repl], z_r[repl], m[repl] = new_q, zr_new, np.exp(ch.aging_sigma * zm_new)
                age[repl], faulted[repl] = 0.0, False
                twin.reset_cells(repl, q * (1 + cfg.meas_bias), prior_trend, abs(prior_trend))
                n_repl = n_new - int((repl & faulted).sum())
                aug_kwh = n_repl * qn * v / 1000
            pack.test(d_ref_strings(q), _rng(seed, mi, S_TEST))

        soh = q / qn
        monthly.append(dict(cond=cond, run=seed, m=mi, sim_year=yr, month=mo,
                            d_ref_kwh=float(d_ref_strings(q).sum()),
                            d_ref_fixed_kwh=float(ph.reference_deliverable(q, tier="fixed", **phys).sum()),
                            soh_mean=float(soh.mean()), soh_min=float(soh.min()),
                            soh_p5=float(np.percentile(soh, 5)), soh_sd=float(soh.std()),
                            aug_kwh=aug_kwh, n_repl=n_repl))
        want = snap_months if snap_months is not None else (0, 59, 119, n_months - 1)
        if snapshots and mi in want:
            snaps[mi] = dict(soh=soh.copy(), twin_mean=twin.x0 / qn, twin_sd=twin.sd / qn,
                             d_ref=float(d_ref_strings(q).sum()), aug_kwh=aug_kwh,
                             pack_d_test=float(pack.d_test.sum()))

    out = dict(events=pd.DataFrame(events), monthly=pd.DataFrame(monthly))
    if snapshots:
        out["snapshots"] = snaps
    return out


# ------------------------------------------------------------------ belief helpers
def _string_energy(qs, soc0, t_cell, faulted, tier, phys, p_str):
    e, p = ph.deliverable(qs, tier=tier, soc0=np.broadcast_to(soc0, qs.shape),
                          t_cell=np.broadcast_to(t_cell, qs.shape), p_string_max=p_str,
                          faulted=np.broadcast_to(faulted, qs.shape), **phys)
    return e, p


def _twin_belief(twin, cfg, soc0, t_cell, faulted, tier, phys, p_str, rng):
    qs = twin.sample(cfg.twin_samples, rng)
    e, p = _string_energy(qs, soc0, t_cell, faulted, tier, phys, p_str)
    return e.sum(axis=-1), float(np.median(p.sum(axis=-1)))


def _u_fixed_window(d, dec: Decision, p_hour, p_grid, alpha=0.05):
    """Best expected shaved kW over power, holding the window fixed (restricted re-optimization),
    subject to the same deliverability chance constraint as the main optimizer."""
    d = np.sort(d)
    si = int(np.where(HE_GRID == dec.start_he)[0][0])
    ks = np.arange(1, dec.window_h + 1)
    prob = 1.0 - np.searchsorted(d, p_grid[:, None] * ks[None, :], side="left") / d.size
    u = p_grid * (prob * p_hour[si:si + dec.window_h][None, :]).sum(axis=1)
    if alpha is not None:
        u = np.where(prob[:, -1] >= 1.0 - alpha, u, 0.0)
    return float(u.max())


def _run_probes(policy, cfg, twin, q_true, faulted, soc0, t_cell, p_hour, phys, p_str, seed, mi,
                rr_ptr, tier, n_cand=8, n_out=6):
    """Execute up to cfg.probe_budget probes. Returns (rr_ptr, n_used, sum_expected_voi_kw, probed).

    VoI policy: greedy, decision-focused. Candidates are pre-screened by 'criticality' (how often
    a cell sits at the rank that limits the string in the belief samples) x posterior sd; for each
    candidate the preposterior value is computed by Gauss-quantile outcomes with the window held
    fixed (a conservative lower bound on the full VoI)."""
    S, N = q_true.shape
    rng_p = _rng(seed, mi, S_PROBE)
    used, gain, probed = 0, 0.0, []
    r_probe = (cfg.sigma_probe * cfg.q_nom_ah) ** 2
    if policy in ("rr", "random"):
        if policy == "rr":
            flat = (rr_ptr + np.arange(cfg.probe_budget)) % (S * N)
            rr_ptr = int((rr_ptr + cfg.probe_budget) % (S * N))
        else:
            flat = _rng(seed, mi, S_RAND).choice(S * N, cfg.probe_budget, replace=False)
        mask = np.zeros((S, N), bool)
        mask.flat[flat] = True
        z = q_true * (1 + cfg.meas_bias) + np.sqrt(r_probe) * rng_p.standard_normal((S, N))
        twin.update(z, r=r_probe, mask=mask)
        return rr_ptr, int(mask.sum()), 0.0, [tuple(map(int, x)) for x in np.argwhere(mask)]

    qn_norm = np.array([-1.383, -0.674, -0.210, 0.210, 0.674, 1.383])[:n_out]  # Gauss-like quantiles
    p_grid = None
    for b in range(cfg.probe_budget):
        rs = _rng(seed, mi, S_SAMP, extra=100 + b)
        zs = rs.standard_normal((cfg.twin_samples, S, N))
        qs = np.maximum(twin.x0[None] + zs * twin.sd[None], 0.0)
        e, p = _string_energy(qs, soc0, t_cell, faulted, tier, phys, p_str)
        d = e.sum(axis=-1)
        p_av = float(np.median(p.sum(axis=-1)))
        dec0 = optimize(d, p_av, p_hour, cfg.alpha)
        if dec0.power_kw <= 0:
            break
        p_grid = np.linspace(p_av / 80, p_av, 80)
        u0 = _u_fixed_window(d, dec0, p_hour, p_grid, cfg.alpha)
        # criticality: rank position that limits the string
        avail = qs * soc0
        ranks = np.argsort(np.argsort(avail, axis=-1), axis=-1)
        k_lim = 0 if tier == "fixed" else N - cfg.n_min
        crit = (np.abs(ranks - k_lim) <= 2).mean(axis=0)
        score = np.where(faulted, 0.0, crit * twin.sd)
        cands = np.argsort(score, axis=None)[::-1][:n_cand]
        best_c, best_v = None, 0.0
        for c in cands:
            si, ni = np.unravel_index(c, (S, N))
            if score[si, ni] <= 0:
                continue
            p00 = twin.p00[si, ni]
            pred_sd = np.sqrt(p00 + r_probe)
            post_sd = np.sqrt(p00 * r_probe / (p00 + r_probe))
            vals = []
            for qz in qn_norm:
                post_mean = twin.x0[si, ni] + p00 / (p00 + r_probe) * (pred_sd * qz)
                qs_c = qs[:, si:si + 1, :].copy()
                qs_c[:, 0, ni] = np.maximum(post_mean + post_sd * zs[:, si, ni], 0.0)
                e_c, _ = _string_energy(qs_c, soc0[:, si:si + 1], t_cell[:, si:si + 1],
                                        faulted[si:si + 1], tier, phys, p_str)
                vals.append(_u_fixed_window(d - e[:, si] + e_c[:, 0], dec0, p_hour, p_grid, cfg.alpha))
            v_c = float(np.mean(vals)) - u0
            if v_c > best_v:
                best_c, best_v = (si, ni), v_c
        if best_c is None:
            break
        mask = np.zeros((S, N), bool)
        mask[best_c] = True
        z = q_true * (1 + cfg.meas_bias) + np.sqrt(r_probe) * rng_p.standard_normal((S, N))
        twin.update(z, r=r_probe, mask=mask)
        used += 1
        gain += best_v
        probed.append((int(best_c[0]), int(best_c[1])))
    return rr_ptr, used, gain, probed
