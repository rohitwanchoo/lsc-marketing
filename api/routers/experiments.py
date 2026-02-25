"""
Experiment Analysis Router

Provides rigorous statistical analysis of A/B experiments:
- Frequentist: two-proportion z-test, p-value, confidence, uplift
- Bayesian: P(B > A) via Monte Carlo Beta sampling (100k samples)
- Sample size calculation for 10% lift at 95% confidence
- Recommendation: declare_winner | continue_test | stop_test_no_winner
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import math
import numpy as np

router = APIRouter()


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

class ExperimentAnalyzeRequest(BaseModel):
    """Input payload for a single A/B experiment analysis."""

    control_conversions: int = Field(..., ge=0, description="Number of conversions in the control group")
    control_visitors:    int = Field(..., ge=1, description="Total visitors in the control group")
    variant_conversions: int = Field(..., ge=0, description="Number of conversions in the variant group")
    variant_visitors:    int = Field(..., ge=1, description="Total visitors in the variant group")
    confidence_level:    float = Field(0.95, ge=0.5, le=0.9999, description="Desired confidence level (e.g. 0.95)")


class FrequentistResult(BaseModel):
    z_score:              float
    p_value:              float
    is_significant:       bool
    confidence_level:     float
    relative_uplift_pct:  float
    absolute_uplift_pct:  float
    control_rate:         float
    variant_rate:         float


class BayesianResult(BaseModel):
    prob_b_beats_a:      float
    expected_loss:       float
    credible_interval_95: list


class ExperimentAnalyzeResponse(BaseModel):
    frequentist:       FrequentistResult
    bayesian:          BayesianResult
    recommendation:    str
    sample_size_needed: int


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/analyze", response_model=ExperimentAnalyzeResponse)
async def analyze_experiment(req: ExperimentAnalyzeRequest):
    """
    Full statistical analysis of an A/B experiment.

    Runs both frequentist (z-test) and Bayesian (Beta Monte Carlo) analyses.
    Returns a clear recommendation based on significance and sample size.
    """
    if req.control_conversions > req.control_visitors:
        raise HTTPException(400, "control_conversions cannot exceed control_visitors")
    if req.variant_conversions > req.variant_visitors:
        raise HTTPException(400, "variant_conversions cannot exceed variant_visitors")

    alpha = 1.0 - req.confidence_level

    # Conversion rates
    control_rate = req.control_conversions / req.control_visitors
    variant_rate = req.variant_conversions / req.variant_visitors

    # ── FREQUENTIST ─────────────────────────────
    z_score, p_value = _z_test_proportions(
        req.control_conversions, req.control_visitors,
        req.variant_conversions, req.variant_visitors,
    )

    is_significant = p_value < alpha

    relative_uplift_pct = (
        ((variant_rate - control_rate) / control_rate * 100.0)
        if control_rate > 0 else 0.0
    )
    absolute_uplift_pct = (variant_rate - control_rate) * 100.0

    frequentist = FrequentistResult(
        z_score=round(z_score, 4),
        p_value=round(p_value, 6),
        is_significant=is_significant,
        confidence_level=req.confidence_level,
        relative_uplift_pct=round(relative_uplift_pct, 4),
        absolute_uplift_pct=round(absolute_uplift_pct, 4),
        control_rate=round(control_rate, 6),
        variant_rate=round(variant_rate, 6),
    )

    # ── BAYESIAN ────────────────────────────────
    prob_b_beats_a, expected_loss, credible_interval = _bayesian_analysis(
        req.control_conversions, req.control_visitors,
        req.variant_conversions, req.variant_visitors,
        n_samples=100_000,
    )

    bayesian = BayesianResult(
        prob_b_beats_a=round(prob_b_beats_a, 4),
        expected_loss=round(expected_loss, 6),
        credible_interval_95=[round(credible_interval[0], 6), round(credible_interval[1], 6)],
    )

    # ── SAMPLE SIZE NEEDED ──────────────────────
    # Minimum sample to detect 10% relative lift at given confidence level with 80% power
    sample_size_needed = _calculate_sample_size(
        baseline_rate=control_rate,
        min_detectable_effect=0.10,
        alpha=alpha,
        power=0.80,
    )

    # ── RECOMMENDATION ──────────────────────────
    total_visitors = req.control_visitors + req.variant_visitors
    recommendation = _make_recommendation(
        is_significant=is_significant,
        relative_uplift_pct=relative_uplift_pct,
        total_visitors=total_visitors,
        sample_size_needed=sample_size_needed,
        prob_b_beats_a=prob_b_beats_a,
    )

    return ExperimentAnalyzeResponse(
        frequentist=frequentist,
        bayesian=bayesian,
        recommendation=recommendation,
        sample_size_needed=sample_size_needed,
    )


# ─────────────────────────────────────────────
# Statistical helper functions
# ─────────────────────────────────────────────

def _z_test_proportions(c_ctrl: int, n_ctrl: int, c_var: int, n_var: int):
    """
    Two-proportion z-test (two-tailed).

    Uses the pooled proportion under H0 (no difference) to compute the
    standard error, then derives a z-score and its two-tailed p-value.

    Returns (z_score, p_value).
    """
    if n_ctrl == 0 or n_var == 0:
        return 0.0, 1.0

    p_ctrl = c_ctrl / n_ctrl
    p_var  = c_var  / n_var
    p_pool = (c_ctrl + c_var) / (n_ctrl + n_var)

    if p_pool <= 0.0 or p_pool >= 1.0:
        return 0.0, 1.0

    se = math.sqrt(p_pool * (1.0 - p_pool) * (1.0 / n_ctrl + 1.0 / n_var))
    if se == 0.0:
        return 0.0, 1.0

    z = (p_var - p_ctrl) / se

    # Two-tailed p-value using the standard normal CDF approximation
    p_value = 2.0 * (1.0 - _norm_cdf(abs(z)))
    return z, max(0.0, min(1.0, p_value))


def _norm_cdf(x: float) -> float:
    """
    Approximation of the standard normal CDF using the complementary
    error function identity: Phi(x) = erfc(-x / sqrt(2)) / 2.

    Uses Python's math.erfc for numerical accuracy.
    """
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def _bayesian_analysis(
    c_ctrl: int, n_ctrl: int,
    c_var:  int, n_var:  int,
    n_samples: int = 100_000,
):
    """
    Bayesian A/B analysis using Beta-distributed priors.

    Both groups use a non-informative Beta(1, 1) prior (uniform).
    Posterior for the control group: Beta(c_ctrl + 1, n_ctrl - c_ctrl + 1)
    Posterior for the variant  group: Beta(c_var  + 1, n_var  - c_var  + 1)

    Draws n_samples from each posterior using numpy to estimate:
      - P(variant > control)
      - Expected loss if variant is chosen but control is actually better
      - 95% credible interval on the variant conversion rate

    Returns (prob_b_beats_a, expected_loss, (ci_low, ci_high)).
    """
    alpha_ctrl = c_ctrl + 1
    beta_ctrl  = n_ctrl - c_ctrl + 1
    alpha_var  = c_var  + 1
    beta_var   = n_var  - c_var  + 1

    rng = np.random.default_rng(seed=42)
    samples_ctrl = rng.beta(alpha_ctrl, beta_ctrl, size=n_samples)
    samples_var  = rng.beta(alpha_var,  beta_var,  size=n_samples)

    prob_b_beats_a = float(np.mean(samples_var > samples_ctrl))

    # Expected loss: average amount we lose by picking variant when control is better
    loss = np.maximum(samples_ctrl - samples_var, 0.0)
    expected_loss = float(np.mean(loss))

    # 95% credible interval on the variant rate
    ci_low  = float(np.percentile(samples_var, 2.5))
    ci_high = float(np.percentile(samples_var, 97.5))

    return prob_b_beats_a, expected_loss, (ci_low, ci_high)


def _calculate_sample_size(
    baseline_rate: float,
    min_detectable_effect: float = 0.10,
    alpha: float = 0.05,
    power: float = 0.80,
) -> int:
    """
    Compute the minimum sample size per variant needed to detect a given
    relative uplift using the standard two-proportion z-test formula.

    Parameters
    ----------
    baseline_rate         : control conversion rate
    min_detectable_effect : minimum relative lift to detect (0.10 = 10%)
    alpha                 : significance level (type-I error rate)
    power                 : desired statistical power (1 - type-II error rate)

    Returns the required sample size per variant (integer, rounded up).
    """
    if baseline_rate <= 0.0 or baseline_rate >= 1.0:
        return 0

    p1 = baseline_rate
    p2 = baseline_rate * (1.0 + min_detectable_effect)
    p2 = min(p2, 0.9999)

    z_alpha = _norm_ppf(1.0 - alpha / 2.0)   # two-tailed critical value
    z_beta  = _norm_ppf(power)                 # power critical value

    # Standard formula: n = (z_alpha + z_beta)^2 * (p1*(1-p1) + p2*(1-p2)) / (p1-p2)^2
    numerator   = (z_alpha + z_beta) ** 2 * (p1 * (1.0 - p1) + p2 * (1.0 - p2))
    denominator = (p1 - p2) ** 2

    if denominator == 0.0:
        return 0

    return math.ceil(numerator / denominator)


def _norm_ppf(p: float) -> float:
    """
    Inverse standard normal CDF (percent-point function) using a rational
    approximation (Beasley-Springer-Moro algorithm).

    Accurate to ~4 decimal places for p in (0.0001, 0.9999).
    """
    if p <= 0.0:
        return -float("inf")
    if p >= 1.0:
        return float("inf")

    c = [2.515517, 0.802853, 0.010328]
    d = [1.432788, 0.189269, 0.001308]

    q = p if p < 0.5 else 1.0 - p
    t = math.sqrt(-2.0 * math.log(q))
    num = c[0] + t * (c[1] + t * c[2])
    den = 1.0 + t * (d[0] + t * (d[1] + t * d[2]))
    x   = t - num / den
    return x if p >= 0.5 else -x


def _make_recommendation(
    is_significant: bool,
    relative_uplift_pct: float,
    total_visitors: int,
    sample_size_needed: int,
    prob_b_beats_a: float,
) -> str:
    """
    Derive a clear action from the statistical results.

    Rules:
    - "declare_winner"        : significant AND meaningful uplift (>= 2% relative)
    - "stop_test_no_winner"   : significant AND negligible uplift (<2% relative),
                                OR large sample with very low Bayesian probability
    - "continue_test"         : not yet significant, still collecting data
    """
    reached_sample = total_visitors >= sample_size_needed * 2

    if is_significant and abs(relative_uplift_pct) >= 2.0:
        return "declare_winner"

    if is_significant and abs(relative_uplift_pct) < 2.0:
        return "stop_test_no_winner"

    # Large sample but Bayesian probability firmly below/above threshold
    if reached_sample and (prob_b_beats_a < 0.10 or prob_b_beats_a > 0.90):
        return "stop_test_no_winner"

    return "continue_test"
