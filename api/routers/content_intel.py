"""
Content Intelligence Router

Analyzes content performance data to surface:
- Conversion rate regression (which content elements predict conversion)
- Content decay detection (when does performance plateau/drop)
- Topic cluster strength scoring
- Internal link optimization recommendations
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import math

router = APIRouter()


class ContentPerformanceData(BaseModel):
    content_id:      str
    title:           str
    content_type:    str
    word_count:      int = 0
    seo_score:       float = 0
    eeat_score:      float = 0
    pageviews:       int = 0
    leads_generated: int = 0
    revenue_attr:    float = 0.0
    published_days_ago: int = 0
    internal_links:  int = 0
    backlinks:       int = 0


class ClusterAnalysisRequest(BaseModel):
    pillar_keyword:  str
    cluster_pages:   List[ContentPerformanceData]


class DecayDetectionRequest(BaseModel):
    weekly_pageviews: List[float]
    weekly_leads:     List[float]
    content_id:       str


@router.post("/regression")
async def content_regression(pages: List[ContentPerformanceData]):
    """
    Identify which content attributes correlate with lead generation.
    Returns ranked feature importance.
    """
    if len(pages) < 5:
        return {"error": "Need at least 5 pages for meaningful regression", "pages_provided": len(pages)}

    # Calculate correlations with lead generation
    correlations = {}
    leads = [p.leads_generated for p in pages]
    leads_mean = sum(leads) / len(leads)

    features = {
        "word_count":      [p.word_count for p in pages],
        "seo_score":       [p.seo_score for p in pages],
        "eeat_score":      [p.eeat_score for p in pages],
        "internal_links":  [p.internal_links for p in pages],
        "backlinks":       [p.backlinks for p in pages],
        "content_age_days": [p.published_days_ago for p in pages],
    }

    for feature_name, values in features.items():
        corr = _pearson_correlation(values, leads)
        correlations[feature_name] = round(corr, 3)

    # Sort by absolute correlation
    sorted_corr = sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True)

    # Identify patterns
    insights = _generate_content_insights(pages, correlations)

    return {
        "pages_analyzed":    len(pages),
        "feature_correlations": {k: v for k, v in sorted_corr},
        "top_driver":        sorted_corr[0][0] if sorted_corr else None,
        "insights":          insights,
        "recommendations":   _content_recommendations(correlations, pages),
    }


@router.post("/decay-detection")
async def detect_content_decay(req: DecayDetectionRequest):
    """
    Detect if content is decaying (losing traffic/leads over time).
    Returns decay status and recommended action.
    """
    if len(req.weekly_pageviews) < 4:
        return {"error": "Need at least 4 weeks of data"}

    pageviews = req.weekly_pageviews
    leads     = req.weekly_leads

    # Calculate trend slopes
    pv_slope  = _linear_slope(list(range(len(pageviews))), pageviews)
    lead_slope = _linear_slope(list(range(len(leads))), leads) if leads else 0

    # Peak performance detection
    peak_pv_week   = pageviews.index(max(pageviews))
    current_pv     = pageviews[-1]
    peak_pv        = max(pageviews)
    decay_pct      = (peak_pv - current_pv) / peak_pv if peak_pv > 0 else 0

    # Classify decay status
    if pv_slope > 0:
        status = "growing"
        action = "Scale — content is gaining momentum"
    elif decay_pct < 0.15:
        status = "stable"
        action = "Maintain — content is holding position"
    elif decay_pct < 0.40:
        status = "declining"
        action = "Refresh — update content, improve internal links, add new sections"
    else:
        status = "decaying"
        action = "Major rewrite or kill — significant traffic/lead loss"

    return {
        "content_id":     req.content_id,
        "status":         status,
        "pageview_trend": f"{pv_slope:+.1f} views/week",
        "lead_trend":     f"{lead_slope:+.2f} leads/week",
        "decay_from_peak": f"{decay_pct * 100:.1f}%",
        "peak_week":      peak_pv_week + 1,
        "weeks_of_data":  len(pageviews),
        "recommended_action": action,
        "urgency": "high" if status == "decaying" else ("medium" if status == "declining" else "low"),
    }


@router.post("/cluster-strength")
async def analyze_cluster_strength(req: ClusterAnalysisRequest):
    """
    Score the strength of a topic cluster.
    A strong cluster = pillar page + multiple satellite pages all ranking and converting.
    """
    pages  = req.cluster_pages
    n      = len(pages)

    if n == 0:
        return {"error": "No pages in cluster"}

    total_leads   = sum(p.leads_generated for p in pages)
    total_revenue = sum(p.revenue_attr for p in pages)
    avg_seo       = sum(p.seo_score for p in pages) / n
    total_links   = sum(p.internal_links for p in pages)
    converting    = sum(1 for p in pages if p.leads_generated > 0)

    # Cluster strength score (0-100)
    depth_score    = min(30, n * 5)           # More pages = stronger
    coverage_score = (converting / n) * 25    # % pages converting
    revenue_score  = min(25, total_revenue / 100)  # Revenue generated
    link_score     = min(20, total_links * 2)  # Internal link density

    cluster_score  = depth_score + coverage_score + revenue_score + link_score

    return {
        "pillar_keyword":    req.pillar_keyword,
        "cluster_size":      n,
        "cluster_score":     round(min(100, cluster_score), 1),
        "pages_converting":  converting,
        "total_leads":       total_leads,
        "total_revenue":     round(total_revenue, 2),
        "avg_seo_score":     round(avg_seo, 1),
        "total_internal_links": total_links,
        "gaps": _identify_cluster_gaps(req.pillar_keyword, pages, n),
        "next_pages_to_create": _suggest_cluster_expansion(req.pillar_keyword, pages),
    }


@router.get("/kill-candidates")
async def get_kill_candidates(
    min_pageviews: int = 200,
    max_conversion_rate: float = 0.005,
    min_age_days: int = 30,
):
    """
    Return criteria for content that should be killed.
    (Actual DB query happens in Node.js layer — this returns the filter logic.)
    """
    return {
        "kill_criteria": {
            "min_pageviews":         min_pageviews,
            "max_conversion_rate":   max_conversion_rate,
            "min_age_days":          min_age_days,
            "description":           f"Pages with >{min_pageviews} views, <{max_conversion_rate*100:.1f}% CVR, older than {min_age_days} days",
        },
        "sql_query": f"""
            SELECT id, title, pageviews, leads_generated,
                   CAST(leads_generated AS FLOAT) / NULLIF(pageviews, 0) AS cvr
            FROM content_assets
            WHERE status = 'published'
              AND pageviews > {min_pageviews}
              AND CAST(leads_generated AS FLOAT) / NULLIF(pageviews, 0) < {max_conversion_rate}
              AND published_at < NOW() - INTERVAL '{min_age_days} days'
            ORDER BY pageviews DESC
        """,
    }


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _pearson_correlation(x: List[float], y: List[float]) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    den = math.sqrt(sum((xi - x_mean)**2 for xi in x) * sum((yi - y_mean)**2 for yi in y))
    return num / den if den != 0 else 0.0


def _linear_slope(x: List[float], y: List[float]) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    num = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    den = sum((xi - x_mean)**2 for xi in x)
    return num / den if den != 0 else 0.0


def _generate_content_insights(pages, correlations):
    insights = []
    if correlations.get("word_count", 0) > 0.3:
        insights.append("Longer content correlates with more leads — prioritize depth over brevity")
    if correlations.get("internal_links", 0) > 0.3:
        insights.append("Internal links strongly predict lead gen — add more strategic internal links")
    if correlations.get("seo_score", 0) > 0.3:
        insights.append("SEO optimization directly impacts conversion — audit low-score pages")
    if correlations.get("eeat_score", 0) > 0.4:
        insights.append("EEAT signals are your strongest conversion driver — prioritize trust elements")
    return insights


def _content_recommendations(correlations, pages) -> List[str]:
    recs = []
    top_feature = max(correlations, key=lambda k: abs(correlations[k]))
    recs.append(f"Optimize '{top_feature}' first — it has the strongest impact on leads")

    low_converters = [p for p in pages if p.pageviews > 100 and p.leads_generated == 0]
    if low_converters:
        recs.append(f"{len(low_converters)} pages have traffic but zero leads — add CTAs and lead magnets")

    high_seo_low_leads = [p for p in pages if p.seo_score > 70 and p.leads_generated < 5]
    if high_seo_low_leads:
        recs.append(f"{len(high_seo_low_leads)} pages have good SEO but few leads — conversion problem, not traffic problem")

    return recs


def _identify_cluster_gaps(pillar: str, pages: List[ContentPerformanceData], n: int) -> List[str]:
    gaps = []
    if n < 5:
        gaps.append(f"Cluster too thin — need at least 5 pages for topical authority (have {n})")
    if not any(p.content_type == "comparison" for p in pages):
        gaps.append("Missing comparison page — high-intent BOFU opportunity")
    if not any(p.content_type == "case_study" for p in pages):
        gaps.append("Missing case study — needed to convert researchers")
    if not any("pricing" in p.title.lower() or "cost" in p.title.lower() for p in pages):
        gaps.append("Missing pricing/cost page — strong BOFU intent keyword")
    return gaps


def _suggest_cluster_expansion(pillar: str, pages: List[ContentPerformanceData]) -> List[str]:
    existing_types = {p.content_type for p in pages}
    suggestions = []
    if "comparison" not in existing_types:
        suggestions.append(f"Best {pillar} alternatives [comparison page]")
    if "case_study" not in existing_types:
        suggestions.append(f"How [company] used {pillar} to achieve X [case study]")
    suggestions.append(f"{pillar} pricing guide [BOFU landing page]")
    suggestions.append(f"{pillar} for [specific industry] [use case page]")
    suggestions.append(f"{pillar} vs [top competitor] [comparison page]")
    return suggestions[:5]
