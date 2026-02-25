"""
Revenue Forecasting Router

Models:
- MRR growth projection (compound growth + cohort retention)
- Lead volume forecasting (linear regression on weekly data)
- Paid channel unlock timeline prediction
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
import math

router = APIRouter()


class MRRForecastRequest(BaseModel):
    current_mrr:          float
    weekly_new_leads:     float
    lead_to_customer_rate: float = Field(0.05, description="Rate of leads converting to customers")
    avg_deal_size:        float
    monthly_churn_rate:   float = Field(0.02, description="Monthly churn rate (0.02 = 2%)")
    months:               int   = Field(12, ge=1, le=36)
    growth_rate_weekly:   float = Field(0.05, description="Expected weekly lead volume growth rate")


class LeadForecastRequest(BaseModel):
    historical_weekly_leads: List[float]
    weeks_ahead:             int = Field(12, ge=1, le=52)


class PaidUnlockRequest(BaseModel):
    current_monthly_leads:   float
    target_monthly_leads:    float = 50.0
    current_conversion_rate: float
    target_conversion_rate:  float = 0.03
    current_cac:             Optional[float] = None
    target_cac:              float = 500.0
    weekly_lead_growth_rate: float = 0.05


@router.post("/mrr")
async def forecast_mrr(req: MRRForecastRequest):
    """Project MRR growth month-by-month based on current organic metrics."""

    projections = []
    mrr = req.current_mrr
    weekly_leads = req.weekly_new_leads

    for month in range(1, req.months + 1):
        # Monthly leads (4.33 weeks per month)
        monthly_leads = weekly_leads * 4.33 * (1 + req.growth_rate_weekly) ** (month * 4.33)

        # New customers this month
        new_customers = monthly_leads * req.lead_to_customer_rate
        new_mrr       = new_customers * req.avg_deal_size

        # Churn
        churned_mrr   = mrr * req.monthly_churn_rate

        # Net MRR
        mrr = mrr + new_mrr - churned_mrr

        projections.append({
            "month":          month,
            "monthly_leads":  round(monthly_leads),
            "new_customers":  round(new_customers, 1),
            "new_mrr":        round(new_mrr, 2),
            "churned_mrr":    round(churned_mrr, 2),
            "net_mrr":        round(mrr, 2),
            "net_new_mrr":    round(new_mrr - churned_mrr, 2),
        })

    # Summary stats
    month_3_mrr  = projections[2]["net_mrr"]  if len(projections) >= 3  else 0
    month_6_mrr  = projections[5]["net_mrr"]  if len(projections) >= 6  else 0
    month_12_mrr = projections[11]["net_mrr"] if len(projections) >= 12 else 0

    return {
        "current_mrr":  req.current_mrr,
        "projections":  projections,
        "summary": {
            "month_3_mrr":        round(month_3_mrr, 2),
            "month_6_mrr":        round(month_6_mrr, 2),
            "month_12_mrr":       round(month_12_mrr, 2),
            "total_arr_at_12mo":  round(month_12_mrr * 12, 2),
            "growth_from_today":  f"{((month_12_mrr / max(req.current_mrr, 1)) - 1) * 100:.0f}%" if req.current_mrr else "N/A",
        },
        "assumptions": {
            "weekly_lead_growth":    f"{req.growth_rate_weekly * 100:.1f}%/week",
            "lead_to_customer_rate": f"{req.lead_to_customer_rate * 100:.1f}%",
            "monthly_churn":         f"{req.monthly_churn_rate * 100:.1f}%",
            "avg_deal_size":         f"${req.avg_deal_size:,.0f}",
        },
    }


@router.post("/leads")
async def forecast_leads(req: LeadForecastRequest):
    """
    Forecast weekly lead volume using linear regression on historical data.
    Simple but robust for 8-16 week horizons.
    """
    if len(req.historical_weekly_leads) < 4:
        return {"error": "Need at least 4 weeks of historical data"}

    data = req.historical_weekly_leads
    n    = len(data)

    # Simple OLS linear regression: y = a + b*x
    x_vals = list(range(n))
    x_mean = sum(x_vals) / n
    y_mean = sum(data) / n

    num = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, data))
    den = sum((x - x_mean) ** 2 for x in x_vals)
    slope     = num / den if den != 0 else 0
    intercept = y_mean - slope * x_mean

    # R-squared
    ss_res = sum((y - (intercept + slope * x)) ** 2 for x, y in zip(x_vals, data))
    ss_tot = sum((y - y_mean) ** 2 for y in data)
    r2     = 1 - ss_res / ss_tot if ss_tot > 0 else 0

    # Forecast
    forecasts = []
    for w in range(req.weeks_ahead):
        x_future = n + w
        predicted = max(0, intercept + slope * x_future)
        # Simple prediction interval (1.96 * RMSE)
        rmse = math.sqrt(ss_res / max(n - 2, 1))
        forecasts.append({
            "week":        w + 1,
            "predicted":   round(predicted, 1),
            "lower_bound": round(max(0, predicted - 1.96 * rmse), 1),
            "upper_bound": round(predicted + 1.96 * rmse, 1),
        })

    return {
        "model":     "linear_regression",
        "r_squared": round(r2, 3),
        "slope":     round(slope, 3),
        "weekly_trend": f"{'+' if slope >= 0 else ''}{slope:.1f} leads/week",
        "historical_avg": round(y_mean, 1),
        "forecasts": forecasts,
        "total_forecast_leads": round(sum(f["predicted"] for f in forecasts)),
    }


@router.post("/paid-unlock-timeline")
async def forecast_paid_unlock(req: PaidUnlockRequest):
    """
    Estimate how many weeks until organic benchmarks unlock paid growth.
    """
    results = {}

    # 1. Lead volume timeline
    if req.current_monthly_leads >= req.target_monthly_leads:
        results["lead_volume"] = {"weeks_away": 0, "status": "achieved"}
    else:
        gap  = req.target_monthly_leads - req.current_monthly_leads
        rate = req.weekly_lead_growth_rate
        # leads_target = leads_current * (1+rate)^weeks * 4.33
        if rate > 0:
            weeks = math.log(req.target_monthly_leads / max(req.current_monthly_leads, 1)) / math.log(1 + rate)
            results["lead_volume"] = {"weeks_away": round(max(0, weeks)), "status": "in_progress"}
        else:
            results["lead_volume"] = {"weeks_away": None, "status": "no_growth — fix lead gen first"}

    # 2. Conversion rate timeline (assume 0.5% improvement/month with CRO work)
    if req.current_conversion_rate >= req.target_conversion_rate:
        results["conversion_rate"] = {"weeks_away": 0, "status": "achieved"}
    else:
        months_needed = (req.target_conversion_rate - req.current_conversion_rate) / 0.005
        results["conversion_rate"] = {
            "weeks_away": round(months_needed * 4.33),
            "status":     "in_progress",
            "note":       "Assumes 0.5pp improvement/month via CRO experiments",
        }

    # 3. CAC (if provided)
    if req.current_cac is not None:
        results["cac"] = {
            "current": req.current_cac,
            "target":  req.target_cac,
            "status":  "achieved" if req.current_cac <= req.target_cac else "above_target",
        }

    # Overall timeline
    weeks_list = [v["weeks_away"] for v in results.values() if isinstance(v.get("weeks_away"), (int, float))]
    max_weeks  = max(weeks_list) if weeks_list else None

    return {
        "thresholds":         results,
        "estimated_unlock_weeks": max_weeks,
        "estimated_unlock_date":  _weeks_to_date(max_weeks) if max_weeks else "Already unlocked!",
        "recommendation": _unlock_recommendation(results),
    }


def _weeks_to_date(weeks: float) -> str:
    import datetime
    target = datetime.date.today() + datetime.timedelta(weeks=weeks)
    return target.strftime("%Y-%m-%d")


def _unlock_recommendation(results: dict) -> str:
    bottlenecks = [k for k, v in results.items() if v.get("status") not in ("achieved",)]
    if not bottlenecks:
        return "All organic thresholds met. Paid growth module ready to activate."
    return f"Bottlenecks to fix first: {', '.join(bottlenecks)}. Focus resources here."
