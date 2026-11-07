"""State estimators (what the decision-maker believes).

CellTwin      per-cell probabilistic digital twin: a 2-state (capacity level, monthly trend)
              Kalman filter per cell, updated from noisy per-cell capacity reports (the brief
              lets teams assume per-cell SOH/capacity monitoring; we add estimation error).
              Belief = Gaussian per cell -> Monte Carlo samples -> deliverable-energy samples
              pushed through the same tier physics.
PackEstimator conventional practice: an annual system capacity test plus a nominal fade
              extrapolation, with temperature correction from the mean cell temperature.
"""

from __future__ import annotations

import numpy as np


class CellTwin:
    def __init__(self, q_meas0: np.ndarray, q_nom: float, sigma_meas: float,
                 prior_trend: float, trend_sd: float, proc_sd_level: float, proc_sd_trend: float):
        self.q_nom = q_nom
        self.r = (sigma_meas * q_nom) ** 2
        self.x0 = q_meas0.astype(float).copy()                 # capacity level (Ah)
        self.x1 = np.full_like(self.x0, prior_trend)           # trend (Ah / month)
        self.p00 = np.full_like(self.x0, self.r)
        self.p01 = np.zeros_like(self.x0)
        self.p11 = np.full_like(self.x0, trend_sd ** 2)
        self.q00 = proc_sd_level ** 2
        self.q11 = proc_sd_trend ** 2

    def predict(self) -> None:
        # x <- F x with F = [[1, 1], [0, 1]]; P <- F P F' + Q
        self.x0 = self.x0 + self.x1
        p00 = self.p00 + 2 * self.p01 + self.p11 + self.q00
        p01 = self.p01 + self.p11
        self.p00, self.p01 = p00, p01
        self.p11 = self.p11 + self.q11

    def update(self, z: np.ndarray, r: float | None = None, mask: np.ndarray | None = None) -> None:
        r = self.r if r is None else r
        s = self.p00 + r
        k0, k1 = self.p00 / s, self.p01 / s
        innov = z - self.x0
        if mask is not None:
            k0, k1 = np.where(mask, k0, 0.0), np.where(mask, k1, 0.0)
        self.x0 = self.x0 + k0 * innov
        self.x1 = self.x1 + k1 * innov
        p00 = (1 - k0) * self.p00
        p01 = (1 - k0) * self.p01
        p11 = self.p11 - k1 * self.p01
        self.p00, self.p01, self.p11 = p00, p01, p11

    @property
    def sd(self) -> np.ndarray:
        return np.sqrt(np.maximum(self.p00, 0.0))

    def sample(self, k: int, rng: np.random.Generator) -> np.ndarray:
        z = rng.standard_normal((k,) + self.x0.shape)
        return np.maximum(self.x0[None] + z * self.sd[None], 0.0)

    def reset_cells(self, mask: np.ndarray, q_meas: np.ndarray, prior_trend: float, trend_sd: float):
        """Cells replaced at maintenance get a fresh prior."""
        self.x0 = np.where(mask, q_meas, self.x0)
        self.x1 = np.where(mask, prior_trend, self.x1)
        self.p00 = np.where(mask, self.r, self.p00)
        self.p01 = np.where(mask, 0.0, self.p01)
        self.p11 = np.where(mask, trend_sd ** 2, self.p11)


class PackEstimator:
    """Conventional: annual capacity test of each string's deliverable energy at 25 C."""

    def __init__(self, d_ref_strings: np.ndarray, sigma_test: float, nominal_fade_month: float,
                 rng: np.random.Generator):
        self.sigma_test = sigma_test
        self.fade = nominal_fade_month
        self.test(d_ref_strings, rng)

    def test(self, d_ref_strings: np.ndarray, rng: np.random.Generator) -> None:
        self.d_test = d_ref_strings * (1 + self.sigma_test * rng.standard_normal(d_ref_strings.shape))
        self.months_since = 0

    def tick(self) -> None:
        self.months_since += 1

    def belief(self, temp_factor: float, k: int, rng: np.random.Generator) -> np.ndarray:
        """Samples of system deliverable energy (kWh); Gaussian around the extrapolated test value."""
        mean = self.d_test.sum() * (1 - self.fade * self.months_since) * temp_factor
        sd_rel = np.sqrt(self.sigma_test ** 2 + (0.004 * self.months_since) ** 2)
        return np.maximum(mean * (1 + sd_rel * rng.standard_normal(k)), 0.0)
