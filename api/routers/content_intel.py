"""
Content Intelligence Router

Two endpoints:

1. POST /content/regression
   Computes Pearson correlations between content attributes and lead generation
   using scipy.stats.pearsonr.  Returns feature importance, p-values,
   interpretation labels, and model R-squared.

2. POST /content/decay-detection
   Analyses traffic and lead trends for each content asset and classifies its
   health status.  Outputs prioritised action recommendations.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import math
import numpy as np
from scipy import stats

router = APIRouter()


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

# ── Content Regression ────────────────────

class ContentAsset(BaseModel):
    """A single content asset with performance metrics for regression."""

    id:               str
    title:            str
    content_type:     str
    word_count:       int   = Field(0, ge=0)
    has_video:        bool  = False
    has_cta:          bool  = False
    publish_month_age: int  = Field(0, ge=0, description="Months since publication")
    internal_links:   int   = Field(0, ge=0)
    backlinks:        int   = Field(0, ge=0)
    leads_generated:  int   = Field(0, ge=0)
    pageviews:        int   = Field(0, ge=0)


class FeatureCorrelation(BaseModel):
    feature:                 str
    correlation_with_leads:  float
    p_value:                 float
    interpretation:          str


class RegressionResponse(BaseModel):
    feature_correlations:  List[FeatureCorrelation]
    top_features:          List[str]
    model_r_squared:       float
    recommendations:       List[str]


# ── Decay Detection ───────────────────────

class DecayAsset(BaseModel):
    """A content asset with before/after traffic and ranking data."""

    id:                      str
    title:                   str
    published_at:            str
    pageviews_last_30d:      int   = Field(0, ge=0)
    pageviews_prior_30d:     int   = Field(0, ge=0)
    leads_last_30d:          int   = Field(0, ge=0)
    leads_prior_30d:         int   = Field(0, ge=0)
    serp_position_current:   Optional[float] = None
    serp_position_prior:     Optional[float] = None


class DecayResult(BaseModel):
    id:                  str
    title:               str
    decay_status:        Literal["healthy", "slight_decay", "significant_decay", "critical_decay"]
    traffic_change_pct:  float
    lead_change_pct:     float
    serp_change:         Optional[float]
    recommended_action:  str
    priority_score:      float


class DecayDetectionRequest(BaseModel):
    content_assets: List[DecayAsset] = Field(..., min_length=1)


class DecayDetectionResponse(BaseModel):
    assets: List[DecayResult]


# ─────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────

@router.post("/regression", response_model=RegressionResponse)
async def content_regression(content_assets: List[ContentAsset]):
    """
    Identify which content attributes correlate with lead generation.

    Uses scipy.stats.pearsonr to compute the correlation coefficient and
    two-tailed p-value for each feature against leads_generated.

    Features analysed:
      - word_count
      - has_video        (binary 0/1)
      - has_cta          (binary 0/1)
      - publish_month_age
      - internal_links
      - backlinks
      - pageviews        (traffic volume — baseline control)

    Returns correlations sorted by absolute value (strongest first).
    """
    if len(content_assets) < 5:
        raise HTTPException(
            400,
            f"Need at least 5 content assets for meaningful regression. "
            f"Received {len(content_assets)}.",
        )

    leads = np.array([a.leads_generated for a in content_assets], dtype=float)

    features: dict = {
        "word_count":        np.array([a.word_count        for a in content_assets], dtype=float),
        "has_video":         np.array([float(a.has_video)  for a in content_assets], dtype=float),
        "has_cta":           np.array([float(a.has_cta)    for a in content_assets], dtype=float),
        "publish_month_age": np.array([a.publish_month_age for a in content_assets], dtype=float),
        "internal_links":    np.array([a.internal_links    for a in content_assets], dtype=float),
        "backlinks":         np.array([a.backlinks         for a in content_assets], dtype=float),
        "pageviews":         np.array([a.pageviews         for a in content_assets], dtype=float),
    }

    correlations: List[FeatureCorrelation] = []

    for feature_name, values in features.items():
        # Pearson requires variance in both arrays
        if np.std(values) == 0 or np.std(leads) == 0:
            r, p = 0.0, 1.0
        else:
            r, p = stats.pearsonr(values, leads)
            r = float(r)
            p = float(p)

        interpretation = _interpret_correlation(feature_name, r, p)
        correlations.append(
            FeatureCorrelation(
                feature=feature_name,
                correlation_with_leads=round(r, 4),
                p_value=round(p, 6),
                interpretation=interpretation,
            )
        )

    # Sort by absolute correlation descending
    correlations.sort(key=lambda c: abs(c.correlation_with_leads), reverse=True)

    top_features = [c.feature for c in correlations if c.p_value < 0.05][:3]
    if not top_features:
        top_features = [c.feature for c in correlations[:3]]

    # Approximate model R-squared using the top feature's r^2
    model_r_squared = correlations[0].correlation_with_leads ** 2 if correlations else 0.0

    recommendations = _build_regression_recommendations(correlations, content_assets)

    return RegressionResponse(
        feature_correlations=correlations,
        top_features=top_features,
        model_r_squared=round(model_r_squared, 4),
        recommendations=recommendations,
    )


@router.post("/decay-detection", response_model=DecayDetectionResponse)
async def decay_detection(req: DecayDetectionRequest):
    """
    Classify each content asset's health and recommend the next action.

    Decay classification rules (applied per asset):

    traffic_change_pct = (last_30d - prior_30d) / max(prior_30d, 1) * 100

    Status thresholds:
      - healthy           : traffic_change >= -10% AND lead_change >= -10%
      - slight_decay      : traffic_change in [-30%, -10%) OR lead_change in [-30%, -10%)
      - significant_decay : traffic_change in [-50%, -30%) OR lead_change in [-50%, -30%)
      - critical_decay    : traffic_change < -50%  OR lead_change < -50%

    Priority score (0-100):
        = 0.4 * |traffic_change| + 0.4 * |lead_change| + 0.2 * serp_drop_factor
      Clamped to 100. Higher = more urgent.
    """
    results: List[DecayResult] = []

    for asset in req.content_assets:
        result = _analyze_asset_decay(asset)
        results.append(result)

    # Sort by priority descending so the most urgent items appear first
    results.sort(key=lambda r: r.priority_score, reverse=True)

    return DecayDetectionResponse(assets=results)


# ─────────────────────────────────────────────
# Decay analysis helpers
# ─────────────────────────────────────────────

def _analyze_asset_decay(asset: DecayAsset) -> DecayResult:
    """Compute decay metrics and action recommendation for a single asset."""

    # Traffic change %
    prior_pv = max(asset.pageviews_prior_30d, 1)
    traffic_change_pct = (asset.pageviews_last_30d - prior_pv) / prior_pv * 100.0

    # Lead change %
    prior_leads = max(asset.leads_prior_30d, 1)
    lead_change_pct = (asset.leads_last_30d - prior_leads) / prior_leads * 100.0

    # SERP change (positive = improved ranking, negative = dropped)
    if (
        asset.serp_position_current is not None
        and asset.serp_position_prior is not None
    ):
        # Lower position number = better rank, so drop in rank = position increased
        serp_change = asset.serp_position_prior - asset.serp_position_current
    else:
        serp_change = None

    # Classify decay status
    worst_change = min(traffic_change_pct, lead_change_pct)
    if worst_change >= -10.0:
        status: Literal["healthy", "slight_decay", "significant_decay", "critical_decay"] = "healthy"
    elif worst_change >= -30.0:
        status = "slight_decay"
    elif worst_change >= -50.0:
        status = "significant_decay"
    else:
        status = "critical_decay"

    # Priority score
    serp_drop_factor = 0.0
    if serp_change is not None and serp_change < 0:
        # Larger position drop = more urgent
        serp_drop_factor = min(100.0, abs(serp_change) * 5.0)

    priority_score = (
        0.40 * min(100.0, abs(traffic_change_pct))
        + 0.40 * min(100.0, abs(lead_change_pct))
        + 0.20 * serp_drop_factor
    )
    priority_score = min(100.0, priority_score)

    recommended_action = _recommend_action(
        status=status,
        serp_change=serp_change,
        traffic_change_pct=traffic_change_pct,
    )

    return DecayResult(
        id=asset.id,
        title=asset.title,
        decay_status=status,
        traffic_change_pct=round(traffic_change_pct, 2),
        lead_change_pct=round(lead_change_pct, 2),
        serp_change=round(serp_change, 2) if serp_change is not None else None,
        recommended_action=recommended_action,
        priority_score=round(priority_score, 2),
    )


def _recommend_action(
    status: str,
    serp_change: Optional[float],
    traffic_change_pct: float,
) -> str:
    """
    Map decay status + supporting signals to a specific recommended action.

    Action taxonomy:
      - monitor           : healthy, watch for changes
      - refresh_content   : slight decay, update information and add new sections
      - add_schema        : slight decay with SERP issues — structured data may help
      - build_backlinks   : significant decay driven by link loss or SERP slip
      - rewrite           : significant to critical decay with poor content quality signals
      - redirect          : critical decay, page beyond recovery
    """
    if status == "healthy":
        return "monitor"

    if status == "slight_decay":
        # If SERP dropped, schema markup can recover rankings
        if serp_change is not None and serp_change < -3:
            return "add_schema"
        return "refresh_content"

    if status == "significant_decay":
        # If SERP has dropped heavily, backlink building is higher priority than a rewrite
        if serp_change is not None and serp_change < -5:
            return "build_backlinks"
        return "rewrite"

    # critical_decay
    if traffic_change_pct < -75:
        return "redirect"
    return "rewrite"


# ─────────────────────────────────────────────
# Regression helpers
# ─────────────────────────────────────────────

def _interpret_correlation(feature: str, r: float, p: float) -> str:
    """
    Return a human-readable interpretation of a Pearson correlation.

    Combines direction, magnitude label, and significance.
    """
    if p >= 0.10:
        sig = "not statistically significant"
    elif p >= 0.05:
        sig = "marginally significant (p<0.10)"
    else:
        sig = "statistically significant (p<0.05)"

    direction = "positive" if r >= 0 else "negative"

    abs_r = abs(r)
    if abs_r >= 0.7:
        strength = "strong"
    elif abs_r >= 0.4:
        strength = "moderate"
    elif abs_r >= 0.2:
        strength = "weak"
    else:
        strength = "negligible"

    return f"{strength.capitalize()} {direction} correlation ({r:+.3f}), {sig}."


def _build_regression_recommendations(
    correlations: List[FeatureCorrelation],
    assets: List[ContentAsset],
) -> List[str]:
    """
    Generate up to 5 actionable content recommendations based on the
    correlation results.
    """
    recs: List[str] = []

    # Top positive correlation driver
    positives = [c for c in correlations if c.correlation_with_leads > 0.2 and c.p_value < 0.10]
    if positives:
        top = positives[0]
        recs.append(
            f"'{top.feature}' is the strongest lead driver (r={top.correlation_with_leads:+.3f}). "
            "Prioritise optimising this attribute across all content."
        )

    # Video signal
    video_corr = next((c for c in correlations if c.feature == "has_video"), None)
    if video_corr and video_corr.correlation_with_leads > 0.2:
        no_video_count = sum(1 for a in assets if not a.has_video)
        if no_video_count > 0:
            recs.append(
                f"Video content correlates positively with leads. "
                f"{no_video_count} assets lack video — consider adding explainer videos."
            )

    # CTA signal
    cta_corr = next((c for c in correlations if c.feature == "has_cta"), None)
    if cta_corr and cta_corr.correlation_with_leads > 0.15:
        no_cta_count = sum(1 for a in assets if not a.has_cta)
        if no_cta_count > 0:
            recs.append(
                f"{no_cta_count} assets have no CTA. Adding lead-capture CTAs could "
                "meaningfully increase conversion."
            )

    # Traffic with zero leads
    high_traffic_zero_leads = [
        a for a in assets if a.pageviews >= 200 and a.leads_generated == 0
    ]
    if high_traffic_zero_leads:
        recs.append(
            f"{len(high_traffic_zero_leads)} assets have ≥200 pageviews but zero leads. "
            "Audit for missing CTAs, weak offers, or mismatched intent."
        )

    # Backlink opportunity
    backlink_corr = next((c for c in correlations if c.feature == "backlinks"), None)
    if backlink_corr and backlink_corr.correlation_with_leads > 0.2:
        low_backlink = [a for a in assets if a.backlinks < 3 and a.leads_generated > 2]
        if low_backlink:
            recs.append(
                f"{len(low_backlink)} high-converting assets have fewer than 3 backlinks. "
                "A focused link-building campaign could amplify their reach."
            )

    return recs[:5]
