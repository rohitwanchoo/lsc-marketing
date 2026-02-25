"""
Revenue Forecasting Router

Three forecasting endpoints:

1. POST /forecasting/mrr
   Projects monthly MRR from historical MRR data using log-linear regression
   (regression on ln(MRR)) plus a cohort-based churn rate.

2. POST /forecasting/leads
   Projects weekly lead volume from historical weekly counts using numpy
   polyfit (degree-1 linear regression).

3. POST /forecasting/paid-unlock-timeline
   Estimates months until organic benchmarks are met to unlock paid growth,
   given current funnel metrics, target MRR, and organic growth rate.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import math
import numpy as np
import datetime

router = APIRouter()


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

# ── MRR Forecasting ────────────────────────

class HistoricalMRRPoint(BaseModel):
    """One month of historical MRR data."""

    month:             str   = Field(..., description="Label, e.g. '2024-01'")
    mrr:               float = Field(..., ge=0)
    new_customers:     int   = Field(0, ge=0)
    churned_customers: int   = Field(0, ge=0)


class MRRForecastRequest(BaseModel):
    historical_mrr:      List[HistoricalMRRPoint] = Field(..., min_length=2)
    months_ahead:        int   = Field(6, ge=1, le=36)
    churn_rate_override: Optional[float] = Field(None, ge=0, le=1)


class MRRProjectionPoint(BaseModel):
    month:           str
    projected_mrr:   float
    confidence_low:  float
    confidence_high: float


class MRRForecastResponse(BaseModel):
    projections:             List[MRRProjectionPoint]
    avg_monthly_growth_rate: float
    avg_churn_rate:          float
    cagr:                    float


# ── Lead Forecasting ───────────────────────

class HistoricalLeadPoint(BaseModel):
    week:  str   = Field(..., description="Label, e.g. 'W01' or '2024-W01'")
    count: int   = Field(..., ge=0)


class LeadForecastRequest(BaseModel):
    historical_leads: List[HistoricalLeadPoint] = Field(..., min_length=4)
    weeks_ahead:      int = Field(12, ge=1, le=52)


class LeadProjectionPoint(BaseModel):
    week:             str
    projected_count:  float
    confidence_low:   float
    confidence_high:  float


class LeadForecastResponse(BaseModel):
    projections:            List[LeadProjectionPoint]
    trend:                  Literal["growing", "stable", "declining"]
    weekly_growth_rate_pct: float


# ── Paid Unlock Timeline ───────────────────

class PaidUnlockRequest(BaseModel):
    current_organic_leads_per_month: float = Field(..., ge=0)
    current_mql_rate:                float = Field(..., ge=0, le=1)
    current_close_rate:              float = Field(..., ge=0, le=1)
    current_avg_deal_size:           float = Field(..., ge=0)
    target_mrr:                      float = Field(..., gt=0)
    current_mrr:                     float = Field(0.0, ge=0)
    organic_growth_rate_monthly:     float = Field(..., description="Monthly organic lead growth rate (e.g. 0.10 = 10%)")


class MilestoneBreach(BaseModel):
    month:        int
    label:        str
    projected_mrr: float


class PaidUnlockResponse(BaseModel):
    months_to_target:               Optional[int]
    projected_monthly_mrr_at_6mo:   float
    projected_monthly_mrr_at_12mo:  float
    milestone_breakdown:            List[MilestoneBreach]
    recommendation:                 str


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("/mrr", response_model=MRRForecastResponse)
async def forecast_mrr(req: MRRForecastRequest):
    """
    Project monthly MRR for the next `months_ahead` months.

    Method:
      1. Fit a linear model to ln(MRR) vs. time index using numpy polyfit.
         This is equivalent to fitting an exponential growth curve to raw MRR.
      2. Derive the average monthly growth rate from the fitted slope.
      3. Compute average churn rate from historical new/churned customer counts.
         If churn_rate_override is provided it takes precedence.
      4. Project forward, applying ±15% confidence bounds that widen linearly
         with the forecast horizon (reaching ±30% at the final month).
    """
    mrr_values = [p.mrr for p in req.historical_mrr]

    # Guard: need positive MRR values to take log
    positive = [m for m in mrr_values if m > 0]
    if len(positive) < 2:
        raise HTTPException(400, "Need at least 2 months of positive MRR to fit a growth model")

    n = len(mrr_values)
    x = np.arange(n, dtype=float)
    y = np.log(np.maximum(mrr_values, 1e-6))   # ln(MRR), guarded against zero

    # Fit degree-1 polynomial to ln(MRR)
    coeffs = np.polyfit(x, y, deg=1)
    slope, intercept = float(coeffs[0]), float(coeffs[1])

    # Average monthly growth rate derived from the log-linear slope
    avg_monthly_growth_rate = math.expm1(slope)  # e^slope - 1

    # Average churn rate
    if req.churn_rate_override is not None:
        avg_churn_rate = req.churn_rate_override
    else:
        avg_churn_rate = _compute_avg_churn(req.historical_mrr)

    # Project forward
    last_mrr = mrr_values[-1] if mrr_values[-1] > 0 else math.exp(intercept + slope * (n - 1))
    projections: List[MRRProjectionPoint] = []

    for i in range(1, req.months_ahead + 1):
        x_future = n - 1 + i
        projected_mrr = math.exp(intercept + slope * x_future)

        # Confidence bands: ±15% base, widening by 1.5% per additional month
        half_band = 0.15 + (i - 1) * 0.015
        half_band = min(half_band, 0.40)   # cap at ±40%

        month_label = _add_months_label(req.historical_mrr[-1].month, i)
        projections.append(
            MRRProjectionPoint(
                month=month_label,
                projected_mrr=round(projected_mrr, 2),
                confidence_low=round(projected_mrr * (1.0 - half_band), 2),
                confidence_high=round(projected_mrr * (1.0 + half_band), 2),
            )
        )

    # CAGR: compound annual growth rate over the historical period
    if n >= 2 and mrr_values[0] > 0 and mrr_values[-1] > 0:
        years = (n - 1) / 12.0
        cagr = (mrr_values[-1] / mrr_values[0]) ** (1.0 / max(years, 1e-9)) - 1.0
    else:
        cagr = avg_monthly_growth_rate * 12.0   # approximation

    return MRRForecastResponse(
        projections=projections,
        avg_monthly_growth_rate=round(avg_monthly_growth_rate, 6),
        avg_churn_rate=round(avg_churn_rate, 6),
        cagr=round(cagr, 6),
    )


@router.post("/leads", response_model=LeadForecastResponse)
async def forecast_leads(req: LeadForecastRequest):
    """
    Project weekly lead counts for the next `weeks_ahead` weeks.

    Method:
      Uses numpy polyfit (degree-1 linear regression) on the historical
      weekly counts.  Confidence bounds are ±1.96 × RMSE (95% PI).

    Trend classification:
      - "growing"   : slope > 0 and weekly_growth_rate >= 1%
      - "declining" : slope < 0
      - "stable"    : otherwise
    """
    counts = [float(p.count) for p in req.historical_leads]
    n = len(counts)

    x = np.arange(n, dtype=float)
    y = np.array(counts, dtype=float)

    coeffs   = np.polyfit(x, y, deg=1)
    slope    = float(coeffs[0])
    intercept = float(coeffs[1])

    # R-squared
    y_pred   = np.polyval(coeffs, x)
    ss_res   = float(np.sum((y - y_pred) ** 2))
    ss_tot   = float(np.sum((y - np.mean(y)) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

    # RMSE for confidence bounds
    rmse = math.sqrt(ss_res / max(n - 2, 1))

    # Trend classification
    avg_count = float(np.mean(y))
    if avg_count > 0:
        weekly_growth_rate_pct = (slope / avg_count) * 100.0
    else:
        weekly_growth_rate_pct = 0.0

    if slope > 0 and weekly_growth_rate_pct >= 1.0:
        trend: Literal["growing", "stable", "declining"] = "growing"
    elif slope < 0:
        trend = "declining"
    else:
        trend = "stable"

    # Project forward
    projections: List[LeadProjectionPoint] = []
    for i in range(1, req.weeks_ahead + 1):
        x_future = float(n - 1 + i)
        predicted = max(0.0, intercept + slope * x_future)

        # Widen interval proportionally to horizon
        interval_factor = 1.96 + (i - 1) * 0.05
        margin = interval_factor * rmse

        week_label = _week_label(req.historical_leads[-1].week, i)
        projections.append(
            LeadProjectionPoint(
                week=week_label,
                projected_count=round(predicted, 1),
                confidence_low=round(max(0.0, predicted - margin), 1),
                confidence_high=round(predicted + margin, 1),
            )
        )

    return LeadForecastResponse(
        projections=projections,
        trend=trend,
        weekly_growth_rate_pct=round(weekly_growth_rate_pct, 4),
    )


@router.post("/paid-unlock-timeline", response_model=PaidUnlockResponse)
async def paid_unlock_timeline(req: PaidUnlockRequest):
    """
    Estimate how many months until organic metrics sustain the target MRR.

    Projection method:
      - leads_month(t) = current_leads * (1 + organic_growth_rate)^t
      - new_customers(t) = leads_month(t) * mql_rate * close_rate
      - new_mrr(t) = new_customers(t) * avg_deal_size
      - mrr(t) = mrr(t-1) + new_mrr(t)  (no churn modelled here for simplicity)

    Searches up to 60 months; if target not reached returns None.
    """
    g = req.organic_growth_rate_monthly
    mrr = req.current_mrr
    months_to_target: Optional[int] = None

    milestone_labels = [
        (req.target_mrr * 0.25, "25% of target MRR"),
        (req.target_mrr * 0.50, "50% of target MRR"),
        (req.target_mrr * 0.75, "75% of target MRR"),
        (req.target_mrr,        "100% — target MRR"),
    ]
    milestone_breakdown: List[MilestoneBreach] = []
    milestone_idx = 0

    mrr_at_6mo:  float = mrr
    mrr_at_12mo: float = mrr

    for month in range(1, 61):
        leads = req.current_organic_leads_per_month * ((1.0 + g) ** month)
        new_customers = leads * req.current_mql_rate * req.current_close_rate
        new_mrr       = new_customers * req.current_avg_deal_size
        mrr           = mrr + new_mrr

        if month == 6:
            mrr_at_6mo = mrr
        if month == 12:
            mrr_at_12mo = mrr

        # Milestone checks
        while milestone_idx < len(milestone_labels):
            threshold, label = milestone_labels[milestone_idx]
            if mrr >= threshold:
                milestone_breakdown.append(
                    MilestoneBreach(
                        month=month,
                        label=label,
                        projected_mrr=round(mrr, 2),
                    )
                )
                milestone_idx += 1
            else:
                break

        if months_to_target is None and mrr >= req.target_mrr:
            months_to_target = month

    # Build recommendation
    recommendation = _build_paid_unlock_recommendation(
        months_to_target=months_to_target,
        organic_growth_rate=g,
        current_mrr=req.current_mrr,
        target_mrr=req.target_mrr,
    )

    return PaidUnlockResponse(
        months_to_target=months_to_target,
        projected_monthly_mrr_at_6mo=round(mrr_at_6mo, 2),
        projected_monthly_mrr_at_12mo=round(mrr_at_12mo, 2),
        milestone_breakdown=milestone_breakdown,
        recommendation=recommendation,
    )


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _compute_avg_churn(history: List[HistoricalMRRPoint]) -> float:
    """
    Estimate average monthly churn rate from historical data.

    churn_rate_t = churned_customers_t / (new_customers_t + churned_customers_t)

    Returns the average across all months that have non-zero customer activity.
    Falls back to 0.05 (5%) if insufficient data.
    """
    rates: List[float] = []
    for p in history:
        total = p.new_customers + p.churned_customers
        if total > 0:
            rates.append(p.churned_customers / total)

    return (sum(rates) / len(rates)) if rates else 0.05


def _add_months_label(last_label: str, months_ahead: int) -> str:
    """
    Advance a 'YYYY-MM' label by `months_ahead` months.

    Falls back to returning the ordinal offset if parsing fails.
    """
    try:
        parts = last_label.split("-")
        year, month = int(parts[0]), int(parts[1])
        month += months_ahead
        year  += (month - 1) // 12
        month  = (month - 1) % 12 + 1
        return f"{year:04d}-{month:02d}"
    except (ValueError, IndexError):
        return f"+{months_ahead}mo"


def _week_label(last_label: str, weeks_ahead: int) -> str:
    """
    Advance a week label by `weeks_ahead`.

    Supports 'YYYY-WNN' format.  Falls back to a simple ordinal offset.
    """
    try:
        # Try 'YYYY-WNN'
        if "W" in last_label.upper():
            parts = last_label.upper().replace("-W", "-").split("-")
            year, week = int(parts[0]), int(parts[-1])
            total_weeks = week + weeks_ahead
            year += (total_weeks - 1) // 52
            week  = (total_weeks - 1) % 52 + 1
            return f"{year:04d}-W{week:02d}"
    except (ValueError, IndexError):
        pass
    return f"+{weeks_ahead}w"


def _build_paid_unlock_recommendation(
    months_to_target: Optional[int],
    organic_growth_rate: float,
    current_mrr: float,
    target_mrr: float,
) -> str:
    """Generate a concise strategic recommendation."""
    if months_to_target is None:
        if organic_growth_rate <= 0:
            return (
                "Organic growth is flat or negative. Immediate action needed: "
                "increase content output, improve SEO, and run conversion experiments "
                "before considering paid channels."
            )
        return (
            f"At the current {organic_growth_rate * 100:.1f}%/month growth rate, "
            f"target MRR of ${target_mrr:,.0f} is not reachable within 60 months. "
            "Accelerate organic growth or revise the target."
        )

    if months_to_target <= 6:
        return (
            f"Target MRR reachable in {months_to_target} months. "
            "Focus on conversion rate optimisation and lead nurturing to accelerate."
        )
    elif months_to_target <= 12:
        return (
            f"Target MRR reachable in {months_to_target} months. "
            "Maintain content velocity and begin paid channel experiments at small scale "
            "to validate CAC before full investment."
        )
    else:
        return (
            f"Target MRR projected in {months_to_target} months at current growth rate. "
            "Prioritise SEO compounding, authority content, and ICP-fit lead generation "
            "to compress the timeline."
        )
