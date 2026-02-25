"""
Lead Scoring Enhancement Router

Enhances raw lead signals into a rich composite score with:
- Weighted composite score (intent 40%, fit 35%, engagement 25%)
- Enterprise / title / content-download bonus multipliers
- Segment classification: hot / warm / cool / cold
- Top-3 signal extraction
- ICP fit percentage
- Velocity score (rate of engagement growth)
- Recommended action: immediate_outreach | nurture_sequence |
                       educational_content | disqualify

Endpoint: POST /scoring/enhance
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

router = APIRouter()


# ─────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────

class LeadInput(BaseModel):
    """A single lead record to be scored."""

    id:                    str
    intent_score:          float = Field(..., ge=0, le=100, description="Raw intent signal (0-100)")
    fit_score:             float = Field(..., ge=0, le=100, description="Raw ICP fit signal (0-100)")
    engagement_score:      float = Field(..., ge=0, le=100, description="Raw engagement signal (0-100)")
    company_size:          Optional[int]   = None
    job_title:             Optional[str]   = None
    industry:              Optional[str]   = None
    pages_visited:         int   = Field(0, ge=0)
    email_opens:           int   = Field(0, ge=0)
    content_downloads:     int   = Field(0, ge=0)
    time_on_site_min:      float = Field(0.0, ge=0)
    days_since_first_touch: int  = Field(0, ge=0)


class EnhancedLead(BaseModel):
    """Enriched scoring output for a single lead."""

    id:                 str
    composite_score:    float
    segment:            str
    top_signals:        List[str]
    recommended_action: str
    icp_fit_pct:        float
    velocity_score:     float


class ScoringRequest(BaseModel):
    """Batch scoring request."""

    leads: List[LeadInput] = Field(..., min_length=1)


class ScoringResponse(BaseModel):
    """Batch scoring response."""

    scored_count:  int
    leads:         List[EnhancedLead]


# ─────────────────────────────────────────────
# ICP reference data
# ─────────────────────────────────────────────

# C-suite / VP level titles that earn a +5% bonus
CSUITE_KEYWORDS = {
    "ceo", "cto", "coo", "cfo", "cmo", "cpo", "chief",
    "vp ", "vp,", "vice president",
}

# Industries with historically high conversion rates
HIGH_VALUE_INDUSTRIES = {
    "saas", "software", "technology", "fintech", "healthcare",
    "marketing", "e-commerce", "financial services",
}


# ─────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────

@router.post("/enhance", response_model=ScoringResponse)
async def enhance_scores(req: ScoringRequest):
    """
    Compute an enhanced composite score for each lead in the batch.

    Scoring formula:
        base = intent_score * 0.40 + fit_score * 0.35 + engagement_score * 0.25

    Bonus multipliers applied multiplicatively on top of the base:
        +10%  if company_size > 500  (enterprise account)
        +5%   if job_title contains a C-suite or VP keyword
        +5%   if content_downloads > 3

    Final composite is clamped to [0, 100].
    """
    enhanced: List[EnhancedLead] = []

    for lead in req.leads:
        result = _score_lead(lead)
        enhanced.append(result)

    return ScoringResponse(scored_count=len(enhanced), leads=enhanced)


# ─────────────────────────────────────────────
# Core scoring logic
# ─────────────────────────────────────────────

def _score_lead(lead: LeadInput) -> EnhancedLead:
    """Compute the full enhanced score for a single lead."""

    # ── BASE COMPOSITE ──────────────────────────
    base = (
        lead.intent_score      * 0.40
        + lead.fit_score       * 0.35
        + lead.engagement_score * 0.25
    )

    # ── BONUS MULTIPLIERS ───────────────────────
    multiplier = 1.0

    is_enterprise = (lead.company_size or 0) > 500
    if is_enterprise:
        multiplier += 0.10

    is_csuite = _is_csuite(lead.job_title)
    if is_csuite:
        multiplier += 0.05

    has_content_downloads = (lead.content_downloads or 0) > 3
    if has_content_downloads:
        multiplier += 0.05

    composite = min(100.0, base * multiplier)

    # ── SEGMENT ─────────────────────────────────
    segment = _classify_segment(composite)

    # ── ICP FIT PERCENTAGE ──────────────────────
    icp_fit_pct = _calculate_icp_fit(
        company_size=lead.company_size,
        job_title=lead.job_title,
        industry=lead.industry,
    )

    # ── VELOCITY SCORE ───────────────────────────
    velocity_score = _calculate_velocity(lead)

    # ── TOP SIGNALS ─────────────────────────────
    top_signals = _extract_top_signals(
        lead=lead,
        is_enterprise=is_enterprise,
        is_csuite=is_csuite,
        has_content_downloads=has_content_downloads,
        composite=composite,
        velocity_score=velocity_score,
    )

    # ── RECOMMENDED ACTION ──────────────────────
    recommended_action = _recommend_action(composite, segment)

    return EnhancedLead(
        id=lead.id,
        composite_score=round(composite, 2),
        segment=segment,
        top_signals=top_signals,
        recommended_action=recommended_action,
        icp_fit_pct=round(icp_fit_pct, 2),
        velocity_score=round(velocity_score, 2),
    )


def _classify_segment(composite: float) -> str:
    """Map composite score to a named segment tier."""
    if composite > 80:
        return "hot"
    elif composite >= 60:
        return "warm"
    elif composite >= 40:
        return "cool"
    else:
        return "cold"


def _is_csuite(job_title: Optional[str]) -> bool:
    """Return True if the job title signals C-suite or VP seniority."""
    if not job_title:
        return False
    lower = job_title.lower()
    return any(kw in lower for kw in CSUITE_KEYWORDS)


def _calculate_icp_fit(
    company_size: Optional[int],
    job_title: Optional[str],
    industry: Optional[str],
) -> float:
    """
    Estimate how closely the lead matches the Ideal Customer Profile.

    Scoring components (each 0–100, averaged):
      - Company size:  100 if 50-500, 80 if >500, 50 if 10-49, 20 otherwise
      - Job title:     100 if C-suite/VP, 80 if Director/Head, 60 if Manager, 20 otherwise
      - Industry:      100 if in high-value set, 50 otherwise

    Returns a percentage (0.0–100.0).
    """
    scores: List[float] = []

    # Company size fit
    if company_size is not None:
        if 50 <= company_size <= 500:
            scores.append(100.0)
        elif company_size > 500:
            scores.append(80.0)
        elif 10 <= company_size < 50:
            scores.append(50.0)
        else:
            scores.append(20.0)

    # Title fit
    if job_title:
        lower = job_title.lower()
        if _is_csuite(job_title):
            scores.append(100.0)
        elif any(kw in lower for kw in ("director", "head of", "head,")):
            scores.append(80.0)
        elif any(kw in lower for kw in ("manager", "lead", "senior")):
            scores.append(60.0)
        else:
            scores.append(20.0)

    # Industry fit
    if industry:
        lower = industry.lower()
        if any(ind in lower for ind in HIGH_VALUE_INDUSTRIES):
            scores.append(100.0)
        else:
            scores.append(50.0)

    return (sum(scores) / len(scores)) if scores else 50.0


def _calculate_velocity(lead: LeadInput) -> float:
    """
    Velocity captures how quickly a lead is engaging.

    Formula:
        total_actions = pages_visited + email_opens + content_downloads
        velocity      = (total_actions / max(days_since_first_touch, 1)) * 10

    Clamped to [0, 100].  A lead with heavy activity on day 0 scores 100.
    """
    total_actions = (
        (lead.pages_visited or 0)
        + (lead.email_opens or 0)
        + (lead.content_downloads or 0)
    )
    days = max(lead.days_since_first_touch, 1)
    velocity = min(100.0, (total_actions / days) * 10.0)
    return velocity


def _extract_top_signals(
    lead: LeadInput,
    is_enterprise: bool,
    is_csuite: bool,
    has_content_downloads: bool,
    composite: float,
    velocity_score: float,
) -> List[str]:
    """
    Return the top 3 positive signals driving this lead's score.

    Signals are ranked by their estimated contribution to the composite.
    """
    candidates: List[tuple] = []

    # Weighted base contributions
    candidates.append((lead.intent_score * 0.40, f"High intent score ({lead.intent_score:.0f}/100)"))
    candidates.append((lead.fit_score * 0.35,    f"Strong ICP fit score ({lead.fit_score:.0f}/100)"))
    candidates.append((lead.engagement_score * 0.25, f"Active engagement score ({lead.engagement_score:.0f}/100)"))

    # Bonus signals
    if is_enterprise:
        candidates.append((10.0, f"Enterprise account (company size: {lead.company_size})"))
    if is_csuite:
        candidates.append((7.0, f"C-suite / VP decision maker ({lead.job_title})"))
    if has_content_downloads:
        candidates.append((6.0, f"Heavy content consumption ({lead.content_downloads} downloads)"))
    if velocity_score >= 60:
        candidates.append((velocity_score * 0.1, f"High engagement velocity ({velocity_score:.0f}/100)"))
    if (lead.pages_visited or 0) >= 5:
        candidates.append((5.0, f"Multiple page visits ({lead.pages_visited} pages)"))
    if (lead.time_on_site_min or 0) >= 10:
        candidates.append((4.0, f"Long session time ({lead.time_on_site_min:.0f} min on site)"))

    # Sort by contribution descending, return top 3 descriptions
    candidates.sort(key=lambda x: x[0], reverse=True)
    return [desc for _, desc in candidates[:3]]


def _recommend_action(composite: float, segment: str) -> str:
    """
    Map composite score / segment to a recommended sales action.

    - hot  (>80)  : immediate_outreach
    - warm (60-80): nurture_sequence
    - cool (40-60): educational_content
    - cold (<40)  : disqualify
    """
    mapping = {
        "hot":  "immediate_outreach",
        "warm": "nurture_sequence",
        "cool": "educational_content",
        "cold": "disqualify",
    }
    return mapping.get(segment, "educational_content")
