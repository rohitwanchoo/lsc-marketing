"""
Lead Scoring Enhancement Router

Enhances the base composite score with:
- ICP firmographic matching
- Behavioral signal weighting
- Intent velocity (how fast engagement is accelerating)
- LTV prediction
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Optional, List, Dict

router = APIRouter()


class LeadScoringRequest(BaseModel):
    email:              str
    full_name:          Optional[str] = None
    company:            Optional[str] = None
    job_title:          Optional[str] = None
    company_size:       Optional[int] = None
    source_keyword:     Optional[str] = None
    source_page_type:   Optional[str] = None  # landing_page|comparison|blog|pricing
    pages_visited:      int = 0
    email_opens:        int = 0
    email_clicks:       int = 0
    visited_pricing:    bool = False
    calendar_visits:    int = 0
    content_consumed:   int = 0
    days_since_signup:  int = 0
    # ICP definition
    icp_titles:         List[str] = []
    icp_company_sizes:  List[str] = []  # e.g. ["10-50","50-200"]


class ScoringResult(BaseModel):
    composite_score:    float
    intent_score:       float
    fit_score:          float
    engagement_score:   float
    velocity_score:     float
    ltv_estimate:       float
    stage:              str
    routing:            str
    score_breakdown:    Dict[str, float]
    recommended_actions: List[str]


@router.post("/enhance", response_model=ScoringResult)
async def enhance_score(req: LeadScoringRequest):
    """Compute an enhanced multi-dimensional lead score."""

    # ── FIT SCORE (0-100) ────────────────────────
    fit = 0.0
    fit_breakdown = {}

    # Job title match
    title_lower = (req.job_title or "").lower()
    if any(t.lower() in title_lower for t in req.icp_titles):
        fit += 30
        fit_breakdown["title_match"] = 30
    elif any(kw in title_lower for kw in ["vp", "director", "head of", "chief"]):
        fit += 20
        fit_breakdown["title_seniority"] = 20
    elif any(kw in title_lower for kw in ["manager", "lead", "senior"]):
        fit += 12
        fit_breakdown["title_partial"] = 12
    else:
        fit_breakdown["title"] = 0

    # Company size
    if req.company_size and req.icp_company_sizes:
        fit += _score_company_size(req.company_size, req.icp_company_sizes) * 25
        fit_breakdown["company_size"] = _score_company_size(req.company_size, req.icp_company_sizes) * 25

    # Email domain (not personal)
    if req.email and not _is_personal_email(req.email):
        fit += 15
        fit_breakdown["business_email"] = 15

    fit = min(100.0, fit)

    # ── INTENT SCORE (0-100) ─────────────────────
    intent = 0.0
    intent_breakdown = {}

    page_type_scores = {
        "pricing":      30,
        "comparison":   25,
        "landing_page": 20,
        "case_study":   15,
        "blog":         8,
    }
    intent += page_type_scores.get(req.source_page_type or "blog", 5)
    intent_breakdown["page_type"] = page_type_scores.get(req.source_page_type or "", 5)

    keyword_intent = _score_keyword_intent(req.source_keyword or "")
    intent += keyword_intent * 30
    intent_breakdown["keyword_intent"] = keyword_intent * 30

    if req.visited_pricing:
        intent += 25
        intent_breakdown["pricing_visit"] = 25

    if req.calendar_visits > 0:
        intent += 15
        intent_breakdown["calendar_visit"] = 15

    intent = min(100.0, intent)

    # ── ENGAGEMENT SCORE (0-100) ─────────────────
    engagement = 0.0
    engagement_breakdown = {}

    engagement += min(30, req.pages_visited * 8)
    engagement_breakdown["pages_visited"] = min(30, req.pages_visited * 8)

    engagement += min(20, req.email_opens * 3)
    engagement_breakdown["email_opens"] = min(20, req.email_opens * 3)

    engagement += min(20, req.email_clicks * 5)
    engagement_breakdown["email_clicks"] = min(20, req.email_clicks * 5)

    engagement += min(15, req.content_consumed * 5)
    engagement_breakdown["content_consumed"] = min(15, req.content_consumed * 5)

    engagement = min(100.0, engagement)

    # ── VELOCITY SCORE (0-100) ─────────────────
    # High engagement in short time = high intent
    velocity = 0.0
    if req.days_since_signup > 0:
        actions_per_day = (req.pages_visited + req.email_opens + req.email_clicks) / req.days_since_signup
        velocity = min(100.0, actions_per_day * 20)
    elif req.pages_visited > 0:
        velocity = 80  # Same-day activity = very high intent

    # ── COMPOSITE (weighted) ─────────────────────
    composite = (
        fit        * 0.25 +
        intent     * 0.35 +
        engagement * 0.25 +
        velocity   * 0.15
    )

    # ── LTV ESTIMATE ─────────────────────────────
    ltv_estimate = _estimate_ltv(composite, fit, req.company_size)

    # ── ROUTING DECISION ─────────────────────────
    stage, routing, actions = _route_lead(composite, intent, fit)

    return ScoringResult(
        composite_score=round(composite, 1),
        intent_score=round(intent, 1),
        fit_score=round(fit, 1),
        engagement_score=round(engagement, 1),
        velocity_score=round(velocity, 1),
        ltv_estimate=round(ltv_estimate, 2),
        stage=stage,
        routing=routing,
        score_breakdown={
            "fit":        fit_breakdown,
            "intent":     intent_breakdown,
            "engagement": engagement_breakdown,
            "velocity":   {"score": round(velocity, 1)},
        },
        recommended_actions=actions,
    )


@router.post("/batch")
async def batch_score(leads: List[LeadScoringRequest]):
    """Score multiple leads in one call — for bulk re-scoring."""
    results = []
    for lead in leads[:100]:  # cap at 100
        result = await enhance_score(lead)
        results.append({"email": lead.email, **result.dict()})
    return {"scored": len(results), "results": results}


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

PERSONAL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
    "icloud.com", "me.com", "aol.com", "protonmail.com",
}

def _is_personal_email(email: str) -> bool:
    domain = email.split("@")[-1].lower()
    return domain in PERSONAL_DOMAINS


def _score_company_size(size: int, icp_ranges: List[str]) -> float:
    """Returns 0.0–1.0 match score for company size."""
    for r in icp_ranges:
        parts = r.split("-")
        if len(parts) == 2:
            try:
                lo, hi = int(parts[0]), int(parts[1])
                if lo <= size <= hi:
                    return 1.0
            except ValueError:
                pass
    return 0.3  # not in ICP size but not zero


BOFU_SIGNALS = ["alternative", "pricing", "review", "comparison", "vs ", "best "]
MOFU_SIGNALS = ["how to", "software", "platform", "tool", "solution"]

def _score_keyword_intent(keyword: str) -> float:
    kw = keyword.lower()
    for sig in BOFU_SIGNALS:
        if sig in kw:
            return 1.0
    for sig in MOFU_SIGNALS:
        if sig in kw:
            return 0.6
    return 0.2  # TOFU


def _estimate_ltv(composite: float, fit: float, company_size: Optional[int]) -> float:
    """Simple LTV estimate based on score + company size."""
    base_ltv = 2400  # 12 months × $200 avg MRR
    score_multiplier = 0.5 + (composite / 100)
    size_multiplier  = 1.0
    if company_size:
        if company_size >= 500:   size_multiplier = 3.0
        elif company_size >= 200: size_multiplier = 2.0
        elif company_size >= 50:  size_multiplier = 1.5
    return base_ltv * score_multiplier * size_multiplier


def _route_lead(composite: float, intent: float, fit: float):
    """Determine stage, routing, and actions."""
    if composite >= 70:
        return (
            "sql",
            "immediate_personal",
            [
                "Send personalized email within 5 minutes",
                "Assign to AE for follow-up call",
                "Create HubSpot deal",
                "Add to high-intent nurture sequence",
            ],
        )
    elif composite >= 50:
        return (
            "mql",
            "automated_nurture",
            [
                "Enroll in MQL nurture sequence",
                "Send value-add content based on source page",
                "Score again in 3 days",
            ],
        )
    elif composite >= 30:
        return (
            "prospect",
            "light_nurture",
            [
                "Add to low-frequency email list",
                "Retarget with relevant content",
                "Monitor for intent spikes",
            ],
        )
    else:
        return (
            "prospect",
            "monitor",
            ["Watch for engagement signals", "No active outreach yet"],
        )
