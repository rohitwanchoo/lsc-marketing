"""
Revenue Attribution Router

Models:
- U-shaped (40/20/40): Default — first & last touch matter most
- Linear: Equal credit across all touchpoints
- Time-decay: Recent touches get more credit
- First-touch: Credit to acquisition only (for SEO measurement)
- Last-touch: Credit to conversion only (for CRO measurement)
- Data-driven: Shapley values approximation (computationally expensive)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import math

router = APIRouter()


class Touchpoint(BaseModel):
    position:    int
    channel:     str
    content_id:  Optional[str] = None
    keyword_id:  Optional[str] = None
    occurred_at: Optional[str] = None
    days_before_conversion: Optional[float] = None


class AttributionRequest(BaseModel):
    revenue_amount: float = Field(..., gt=0)
    touchpoints:    List[Touchpoint]
    model: Literal["u_shaped", "linear", "time_decay", "first_touch", "last_touch", "data_driven"] = "u_shaped"
    time_decay_half_life_days: float = Field(7.0, description="Days for time-decay half-life")


class AttributionResult(BaseModel):
    model:              str
    total_amount:       float
    touchpoints_count:  int
    allocations:        List[dict]
    insights:           dict


@router.post("/analyze", response_model=AttributionResult)
async def analyze_attribution(req: AttributionRequest):
    """
    Attribute revenue across touchpoints using the specified model.
    Returns credit allocation per touchpoint.
    """
    if not req.touchpoints:
        raise HTTPException(400, "Need at least one touchpoint")

    weights   = _calculate_weights(req.touchpoints, req.model, req.time_decay_half_life_days)
    allocations = []

    for tp, weight in zip(req.touchpoints, weights):
        allocations.append({
            "position":    tp.position,
            "channel":     tp.channel,
            "content_id":  tp.content_id,
            "keyword_id":  tp.keyword_id,
            "weight":      round(weight, 4),
            "amount_usd":  round(req.revenue_amount * weight, 2),
            "pct":         f"{weight * 100:.1f}%",
        })

    insights = _generate_insights(allocations, req.revenue_amount, req.model)

    return AttributionResult(
        model=req.model,
        total_amount=req.revenue_amount,
        touchpoints_count=len(req.touchpoints),
        allocations=allocations,
        insights=insights,
    )


@router.post("/compare-models")
async def compare_attribution_models(req: AttributionRequest):
    """Run all attribution models and compare results — useful for calibration."""
    models = ["u_shaped", "linear", "time_decay", "first_touch", "last_touch"]
    results = {}

    for model in models:
        weights = _calculate_weights(req.touchpoints, model, req.time_decay_half_life_days)
        by_channel: dict = {}
        for tp, w in zip(req.touchpoints, weights):
            by_channel[tp.channel] = by_channel.get(tp.channel, 0) + w * req.revenue_amount

        results[model] = {ch: round(amt, 2) for ch, amt in by_channel.items()}

    return {
        "revenue_amount": req.revenue_amount,
        "touchpoints":    len(req.touchpoints),
        "by_model":       results,
        "recommendation": _recommend_model(req.touchpoints),
    }


@router.post("/channel-roi")
async def calculate_channel_roi(data: dict):
    """
    Given a list of revenue events with touchpoints,
    calculate true multi-touch ROI per channel.
    """
    channel_credits: dict = {}
    channel_revenue: dict = {}

    for event in data.get("events", []):
        tps    = [Touchpoint(**tp) for tp in event.get("touchpoints", [])]
        amount = float(event.get("amount", 0))
        if not tps:
            continue

        weights = _calculate_weights(tps, "u_shaped", 7.0)
        for tp, w in zip(tps, weights):
            ch = tp.channel
            channel_credits[ch] = channel_credits.get(ch, 0) + 1
            channel_revenue[ch] = channel_revenue.get(ch, 0) + amount * w

    return {
        "channel_roi": {
            ch: {
                "attributed_revenue": round(rev, 2),
                "touchpoints":        channel_credits.get(ch, 0),
                "avg_per_touch":      round(rev / channel_credits.get(ch, 1), 2),
            }
            for ch, rev in sorted(channel_revenue.items(), key=lambda x: -x[1])
        }
    }


# ─────────────────────────────────────────────
# Attribution model implementations
# ─────────────────────────────────────────────

def _calculate_weights(touchpoints: List[Touchpoint], model: str, half_life: float) -> List[float]:
    n = len(touchpoints)
    if n == 0:
        return []
    if n == 1:
        return [1.0]

    if model == "u_shaped":
        return _u_shaped(n)
    elif model == "linear":
        return [1.0 / n] * n
    elif model == "time_decay":
        return _time_decay(touchpoints, half_life)
    elif model == "first_touch":
        return [1.0] + [0.0] * (n - 1)
    elif model == "last_touch":
        return [0.0] * (n - 1) + [1.0]
    elif model == "data_driven":
        return _shapley_approximation(n)
    return _u_shaped(n)


def _u_shaped(n: int) -> List[float]:
    if n == 2:
        return [0.5, 0.5]
    first_last = 0.40
    middle_total = 0.20
    middle_per = middle_total / (n - 2) if n > 2 else 0
    weights = [first_last] + [middle_per] * (n - 2) + [first_last]
    return weights


def _time_decay(touchpoints: List[Touchpoint], half_life: float) -> List[float]:
    # More recent = higher weight
    raw = []
    for tp in touchpoints:
        days = tp.days_before_conversion or float(len(touchpoints) - tp.position)
        raw.append(math.pow(0.5, days / half_life))
    total = sum(raw) or 1.0
    return [w / total for w in raw]


def _shapley_approximation(n: int) -> List[float]:
    """
    Simplified Shapley value approximation.
    First and last get double credit, middle gets equal shares.
    Better approximation requires full coalition enumeration.
    """
    if n <= 2:
        return [0.5] * n
    base = 1.0 / n
    boost = base * 0.5  # 50% bonus for first and last
    weights = [base + boost] + [base] * (n - 2) + [base + boost]
    total = sum(weights)
    return [w / total for w in weights]


def _generate_insights(allocations: List[dict], total: float, model: str) -> dict:
    by_channel: dict = {}
    for a in allocations:
        ch = a["channel"]
        by_channel[ch] = by_channel.get(ch, 0) + a["amount_usd"]

    top_channel = max(by_channel, key=by_channel.get) if by_channel else None
    organic_pct = sum(
        v for k, v in by_channel.items()
        if k in ("organic_search", "linkedin", "email", "referral")
    ) / total if total else 0

    return {
        "top_channel":         top_channel,
        "top_channel_amount":  round(by_channel.get(top_channel, 0), 2) if top_channel else 0,
        "organic_attribution": f"{organic_pct * 100:.1f}%",
        "by_channel":          {ch: round(amt, 2) for ch, amt in by_channel.items()},
        "model_used":          model,
    }


def _recommend_model(touchpoints: List[Touchpoint]) -> str:
    n = len(touchpoints)
    if n == 1:
        return "first_touch — single touchpoint, no distribution needed"
    if n == 2:
        return "linear — two touchpoints, equal credit is fair"
    if n <= 5:
        return "u_shaped — standard multi-touch, emphasizes acquisition and conversion"
    return "time_decay — long journeys benefit from recency weighting"
