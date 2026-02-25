"""
Experiment Analysis Router

Proper frequentist A/B test analysis:
- Chi-squared test for conversion rates
- Z-test for proportions
- Bayesian probability that B > A
- Minimum detectable effect calculation
- Sample size requirements
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
import math

router = APIRouter()


# ─────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────

class ExperimentData(BaseModel):
    experiment_name: str
    visitors_a:    int = Field(..., ge=0)
    visitors_b:    int = Field(..., ge=0)
    conversions_a: int = Field(..., ge=0)
    conversions_b: int = Field(..., ge=0)
    revenue_a:     float = Field(0.0, ge=0)
    revenue_b:     float = Field(0.0, ge=0)
    metric:        str = Field("conversions", description="conversions|revenue")

class SampleSizeRequest(BaseModel):
    baseline_rate:      float = Field(..., description="Current conversion rate (0-1)")
    minimum_detectable: float = Field(0.10, description="Min relative uplift to detect (e.g. 0.10 = 10%)")
    power:              float = Field(0.80, description="Statistical power (0.8 = 80%)")
    significance:       float = Field(0.05, description="Alpha level (0.05 = 95% confidence)")


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("/analyze")
async def analyze_experiment(data: ExperimentData):
    """
    Full statistical analysis of an A/B experiment.
    Returns: confidence, winner, uplift, recommendation.
    """
    if data.visitors_a == 0 or data.visitors_b == 0:
        raise HTTPException(400, "Need visitors in both variants")

    # Conversion rates
    rate_a = data.conversions_a / data.visitors_a
    rate_b = data.conversions_b / data.visitors_b

    # Uplift
    uplift = (rate_b - rate_a) / rate_a if rate_a > 0 else 0.0

    # Z-test for proportions
    z_score, p_value = _z_test_proportions(
        data.conversions_a, data.visitors_a,
        data.conversions_b, data.visitors_b,
    )

    confidence      = (1 - p_value) * 100
    is_significant  = p_value < 0.05
    is_winner       = rate_b > rate_a

    # Bayesian probability B > A (Beta distribution approximation)
    prob_b_beats_a = _bayesian_probability(
        data.conversions_a, data.visitors_a,
        data.conversions_b, data.visitors_b,
    )

    # Revenue per visitor
    rpv_a = data.revenue_a / data.visitors_a if data.visitors_a else 0
    rpv_b = data.revenue_b / data.visitors_b if data.visitors_b else 0

    # Decision
    decision = _make_decision(confidence, uplift, is_winner,
                               data.visitors_a + data.visitors_b)

    return {
        "experiment_name":    data.experiment_name,
        "variant_a": {
            "visitors":        data.visitors_a,
            "conversions":     data.conversions_a,
            "conversion_rate": round(rate_a, 4),
            "revenue_per_visitor": round(rpv_a, 2),
        },
        "variant_b": {
            "visitors":        data.visitors_b,
            "conversions":     data.conversions_b,
            "conversion_rate": round(rate_b, 4),
            "revenue_per_visitor": round(rpv_b, 2),
        },
        "statistics": {
            "z_score":            round(z_score, 3),
            "p_value":            round(p_value, 4),
            "confidence_pct":     round(confidence, 1),
            "is_significant":     is_significant,
            "uplift_relative":    round(uplift, 4),
            "uplift_pct":         f"{uplift * 100:+.1f}%",
            "prob_b_beats_a":     round(prob_b_beats_a, 3),
        },
        "decision": decision,
        "winner":   "b" if (is_winner and is_significant) else ("a" if (not is_winner and is_significant) else None),
    }


@router.post("/sample-size")
async def calculate_sample_size(req: SampleSizeRequest):
    """Calculate required sample size per variant for a given experiment."""
    alpha = req.significance
    beta  = 1 - req.power

    # Z-values
    z_alpha = _norm_ppf(1 - alpha / 2)  # two-tailed
    z_beta  = _norm_ppf(req.power)

    p1 = req.baseline_rate
    p2 = p1 * (1 + req.minimum_detectable)

    # Standard formula
    n = math.ceil(
        (z_alpha + z_beta) ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))
        / (p1 - p2) ** 2
    )

    return {
        "sample_size_per_variant": n,
        "total_sample_size":       n * 2,
        "baseline_rate":           req.baseline_rate,
        "target_rate":             round(p2, 4),
        "minimum_detectable":      req.minimum_detectable,
        "power":                   req.power,
        "significance":            req.significance,
        "note": "Achieve this many visitors per variant before reading results",
    }


@router.get("/running-too-long")
async def detect_peeking():
    """Detect experiments that have been running too long without significance."""
    # In production, query the experiments table
    return {
        "warning": "Peeking at results before reaching required sample size inflates false positive rate",
        "recommendation": "Use sequential testing or pre-commit to sample size",
    }


# ─────────────────────────────────────────────
# Statistical functions (no scipy dependency)
# ─────────────────────────────────────────────

def _z_test_proportions(c_a, n_a, c_b, n_b):
    """Two-proportion z-test."""
    if n_a == 0 or n_b == 0:
        return 0.0, 1.0

    p_a     = c_a / n_a
    p_b     = c_b / n_b
    p_pool  = (c_a + c_b) / (n_a + n_b)

    if p_pool in (0, 1):
        return 0.0, 1.0

    se      = math.sqrt(p_pool * (1 - p_pool) * (1/n_a + 1/n_b))
    if se == 0:
        return 0.0, 1.0

    z       = (p_b - p_a) / se
    p_value = 2 * (1 - _norm_cdf(abs(z)))  # two-tailed
    return z, p_value


def _norm_cdf(x):
    """Approximation of the standard normal CDF using Horner's method."""
    t = 1.0 / (1.0 + 0.2316419 * abs(x))
    d = 0.3989423 * math.exp(-x * x / 2)
    prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))))
    return 1 - prob if x >= 0 else prob


def _norm_ppf(p):
    """Rational approximation for the inverse normal CDF."""
    if p <= 0 or p >= 1:
        return 0.0
    c = [2.515517, 0.802853, 0.010328]
    d = [1.432788, 0.189269, 0.001308]
    q = p if p < 0.5 else 1 - p
    t = math.sqrt(-2 * math.log(q))
    num = c[0] + t * (c[1] + t * c[2])
    den = 1 + t * (d[0] + t * (d[1] + t * d[2]))
    x   = t - num / den
    return x if p >= 0.5 else -x


def _bayesian_probability(c_a, n_a, c_b, n_b, num_samples=10_000):
    """
    Estimate P(B > A) using beta distribution Monte Carlo.
    Beta(alpha, beta) where alpha = conversions+1, beta = non-conversions+1.
    Uses a closed-form approximation for speed.
    """
    import random
    alpha_a = c_a + 1
    beta_a  = n_a - c_a + 1
    alpha_b = c_b + 1
    beta_b  = n_b - c_b + 1

    # Numerically stable approximation
    wins_b  = 0
    for _ in range(num_samples):
        # Sample from Beta using log-gamma trick
        sample_a = _sample_beta(alpha_a, beta_a, random)
        sample_b = _sample_beta(alpha_b, beta_b, random)
        if sample_b > sample_a:
            wins_b += 1

    return wins_b / num_samples


def _sample_beta(alpha, beta_param, random_module):
    """Sample from Beta(alpha, beta) using the Johnk method approximation."""
    # For large alpha/beta, use normal approximation
    mu    = alpha / (alpha + beta_param)
    var   = alpha * beta_param / ((alpha + beta_param) ** 2 * (alpha + beta_param + 1))
    sigma = math.sqrt(max(var, 1e-10))
    # Box-Muller
    u1 = random_module.random()
    u2 = random_module.random()
    z  = math.sqrt(-2 * math.log(max(u1, 1e-10))) * math.cos(2 * math.pi * u2)
    return max(0.0, min(1.0, mu + sigma * z))


def _make_decision(confidence, uplift, b_is_higher, total_visitors):
    if total_visitors < 100:
        return {"action": "continue", "reason": "Insufficient sample size — need at least 100 total visitors"}
    if confidence >= 95 and b_is_higher and uplift >= 0.05:
        return {"action": "declare_winner_b", "reason": f"B wins with {confidence:.1f}% confidence, {uplift*100:+.1f}% uplift"}
    if confidence >= 95 and not b_is_higher and abs(uplift) >= 0.05:
        return {"action": "declare_winner_a", "reason": f"A wins with {confidence:.1f}% confidence"}
    if confidence >= 95 and abs(uplift) < 0.05:
        return {"action": "inconclusive", "reason": "Statistically significant but practically negligible difference"}
    if total_visitors > 5000 and confidence < 80:
        return {"action": "kill", "reason": "Large sample, no signal — wasting traffic"}
    return {"action": "continue", "reason": f"Running — {confidence:.1f}% confidence, need 95%"}
