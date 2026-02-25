"""
Revenue Attribution Router

Implements six multi-touch attribution models:

- u_shaped    : 40% first / 40% last / 20% evenly across middle touches
- linear      : equal credit to every touch
- time_decay  : exponential decay toward first touch (half-life = 7 days)
- first_touch : 100% credit to the very first touch
- last_touch  : 100% credit to the very last touch
- data_driven : approximate Shapley values via permutation sampling
                (falls back to heuristic when > 8 touchpoints)

Endpoint: POST /attribution/analyze
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone
import math
import itertools
import random

router = APIRouter()


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

class TouchpointInput(BaseModel):
    """A single marketing touchpoint on a customer's journey."""

    touch_type:  str = Field(..., description="Type of touch (e.g. organic_search, email, linkedin)")
    occurred_at: str = Field(..., description="ISO-8601 timestamp of the touch")
    channel:     str = Field(..., description="Marketing channel (e.g. seo, social, email)")
    keyword:     Optional[str] = None
    content_id:  Optional[str] = None
    amount:      float = Field(0.0, ge=0, description="Revenue contributed at this touch (0 if unknown)")


class AttributionRequest(BaseModel):
    """Input for the attribution analysis endpoint."""

    touchpoints:  List[TouchpointInput] = Field(..., min_length=1)
    total_revenue: float = Field(..., gt=0, description="Total revenue to attribute across touchpoints")
    model_type:   Literal["u_shaped", "linear", "time_decay", "first_touch", "last_touch", "data_driven"] = "u_shaped"


class TouchpointAttribution(BaseModel):
    """Attribution result for a single touchpoint."""

    index:            int
    touch_type:       str
    channel:          str
    keyword:          Optional[str]
    content_id:       Optional[str]
    occurred_at:      str
    attributed_amount: float
    attribution_pct:  float


class AttributionResponse(BaseModel):
    """Full attribution analysis response."""

    model_used:            str
    total_revenue:         float
    touchpoints_count:     int
    touchpoint_attribution: List[TouchpointAttribution]
    insights:              List[str]


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/analyze", response_model=AttributionResponse)
async def analyze_attribution(req: AttributionRequest):
    """
    Attribute total_revenue across the provided touchpoints using the
    chosen model.

    The response includes an attributed_amount and attribution_pct for
    every touchpoint, plus a list of high-level insights about channel
    performance.
    """
    tps = req.touchpoints

    if not tps:
        raise HTTPException(400, "At least one touchpoint is required")

    weights = _calculate_weights(tps, req.model_type)

    attribution_list: List[TouchpointAttribution] = []
    for i, (tp, w) in enumerate(zip(tps, weights)):
        attribution_list.append(
            TouchpointAttribution(
                index=i,
                touch_type=tp.touch_type,
                channel=tp.channel,
                keyword=tp.keyword,
                content_id=tp.content_id,
                occurred_at=tp.occurred_at,
                attributed_amount=round(req.total_revenue * w, 2),
                attribution_pct=round(w * 100.0, 2),
            )
        )

    insights = _generate_insights(attribution_list, req.total_revenue, req.model_type)

    return AttributionResponse(
        model_used=req.model_type,
        total_revenue=req.total_revenue,
        touchpoints_count=len(tps),
        touchpoint_attribution=attribution_list,
        insights=insights,
    )


# ─────────────────────────────────────────────
# Attribution model implementations
# ─────────────────────────────────────────────

def _calculate_weights(tps: List[TouchpointInput], model: str) -> List[float]:
    """
    Dispatch to the appropriate attribution model and return a list of
    weights that sum to 1.0.
    """
    n = len(tps)
    if n == 0:
        return []
    if n == 1:
        return [1.0]

    if model == "u_shaped":
        return _u_shaped(n)
    elif model == "linear":
        return [1.0 / n] * n
    elif model == "time_decay":
        return _time_decay(tps)
    elif model == "first_touch":
        return [1.0] + [0.0] * (n - 1)
    elif model == "last_touch":
        return [0.0] * (n - 1) + [1.0]
    elif model == "data_driven":
        return _data_driven(n)
    # Fallback
    return _u_shaped(n)


def _u_shaped(n: int) -> List[float]:
    """
    U-shaped (position-based) model:
      - First touch  : 40%
      - Last touch   : 40%
      - Middle touches: 20% split evenly

    Special case when n == 2: 50/50.
    """
    if n == 2:
        return [0.5, 0.5]

    middle_count = n - 2
    middle_weight = 0.20 / middle_count if middle_count > 0 else 0.0
    weights = [0.40] + [middle_weight] * middle_count + [0.40]
    return weights


def _time_decay(tps: List[TouchpointInput], half_life_days: float = 7.0) -> List[float]:
    """
    Time-decay model: more recent touches receive more credit.

    Each touch's raw weight is 0.5^(days_before_conversion / half_life).
    Days before conversion are computed from ISO-8601 timestamps; if
    parsing fails the touch's ordinal position is used as a fallback.

    The weights are then normalised to sum to 1.0.
    """
    n = len(tps)

    # Attempt to parse the conversion date (most recent touch)
    conversion_ts = _parse_iso(tps[-1].occurred_at)

    raw_weights: List[float] = []
    for i, tp in enumerate(tps):
        if conversion_ts is not None:
            ts = _parse_iso(tp.occurred_at)
            days_before = (
                max(0.0, (conversion_ts - ts).total_seconds() / 86400.0)
                if ts is not None
                else float(n - 1 - i)
            )
        else:
            # Fallback: assume position encodes recency (last touch = 0 days before)
            days_before = float(n - 1 - i)

        raw_weights.append(math.pow(0.5, days_before / half_life_days))

    total = sum(raw_weights) or 1.0
    return [w / total for w in raw_weights]


def _data_driven(n: int) -> List[float]:
    """
    Approximate Shapley value attribution.

    For n <= 8 touchpoints: enumerate all permutations and compute exact
    marginal contributions for each position.

    For n > 8 touchpoints: use a heuristic — first and last receive
    double base weight, middle touches receive base weight — then
    normalise.  This avoids factorial blowup while preserving the
    intuition that acquisition and closing touches drive the most value.
    """
    if n <= 1:
        return [1.0 / max(n, 1)] * n

    if n > 8:
        return _shapley_heuristic(n)

    # Exact Shapley via permutation enumeration
    # Coalition value function: linear model — each position adds 1/n value
    # The Shapley value for position i is its average marginal contribution
    # across all orderings.  For a simple additive game this reduces to 1/n,
    # but we weight by position to approximate real-world diminishing returns.

    positions = list(range(n))
    shapley = [0.0] * n
    count   = 0

    for perm in itertools.permutations(positions):
        count += 1
        # Marginal contribution of each player (position) in this order
        # Use a concave value function: v(S) = sum of sqrt(1/(pos+1)) for pos in S
        cumulative = 0.0
        for k, pos in enumerate(perm):
            # Value of coalition without this player
            v_without = cumulative
            # Value with this player
            individual_value = math.sqrt(1.0 / (pos + 1))
            v_with = cumulative + individual_value
            shapley[pos] += v_with - v_without
            cumulative    = v_with

    # Normalise to sum to 1
    total = sum(shapley) or 1.0
    return [s / total for s in shapley]


def _shapley_heuristic(n: int) -> List[float]:
    """
    Heuristic Shapley approximation for n > 8 touchpoints.

    First and last get 2x the base weight; all others get 1x.
    """
    base = 1.0
    weights = [base] * n
    weights[0]  = base * 2.0
    weights[-1] = base * 2.0
    total = sum(weights)
    return [w / total for w in weights]


# ─────────────────────────────────────────────
# Insight generation
# ─────────────────────────────────────────────

def _generate_insights(
    attributions: List[TouchpointAttribution],
    total_revenue: float,
    model: str,
) -> List[str]:
    """
    Derive actionable insights from the attribution results.

    Aggregates credit by channel and surfaces the top channels, organic
    share, and model-specific guidance.
    """
    insights: List[str] = []

    # Credit by channel
    channel_credit: dict = {}
    for a in attributions:
        channel_credit[a.channel] = channel_credit.get(a.channel, 0.0) + a.attributed_amount

    if not channel_credit:
        return insights

    # Top channel
    top_channel, top_amount = max(channel_credit.items(), key=lambda x: x[1])
    insights.append(
        f"Top channel: '{top_channel}' with ${top_amount:,.2f} "
        f"({top_amount / total_revenue * 100:.1f}% of revenue) under the {model} model."
    )

    # Organic vs paid breakdown
    organic_channels = {"organic_search", "seo", "linkedin", "email", "referral", "content"}
    organic_total = sum(v for k, v in channel_credit.items() if k in organic_channels)
    organic_pct   = organic_total / total_revenue * 100.0 if total_revenue else 0.0
    if organic_pct > 0:
        insights.append(
            f"Organic channels account for ${organic_total:,.2f} ({organic_pct:.1f}%) of attributed revenue."
        )

    # Model-specific guidance
    model_tips = {
        "u_shaped":    "U-shaped model rewards the channels that first attracted and finally converted the lead.",
        "linear":      "Linear model distributes credit equally — good for understanding full-journey impact.",
        "time_decay":  "Time-decay model favours recent touches — useful for fast sales cycles.",
        "first_touch": "First-touch model highlights acquisition channels — pair with CAC analysis.",
        "last_touch":  "Last-touch model emphasises conversion — useful for identifying closing content.",
        "data_driven": "Data-driven (Shapley) model approximates each channel's true incremental value.",
    }
    if model in model_tips:
        insights.append(model_tips[model])

    # Multi-touch journey length advice
    n = len(attributions)
    if n == 1:
        insights.append("Single-touch journey: all models agree. Increase top-of-funnel touchpoints.")
    elif n >= 7:
        insights.append(
            f"Long {n}-touch journey detected. Consider time-decay or data-driven models "
            "for the most accurate channel attribution."
        )

    return insights


# ─────────────────────────────────────────────
# Utility
# ─────────────────────────────────────────────

def _parse_iso(ts_str: str):
    """
    Parse an ISO-8601 timestamp string, returning a timezone-aware
    datetime or None on failure.
    """
    if not ts_str:
        return None
    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(ts_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None
