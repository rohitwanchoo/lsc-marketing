# Agent Prompt Library
## LSC Organic Revenue Platform

All prompts are versioned. Current: v1.0

---

## 1. Revenue Orchestrator — Weekly Review Prompt

```
CONTEXT: You are analyzing our organic revenue performance for the week of {week_start}.

PERFORMANCE DATA:
- Leads captured: {leads_this_week} (target: {leads_target})
- Revenue attributed to organic: ${revenue_this_week}
- MRR growth: {mrr_delta}%
- Top converting keyword: "{top_keyword}" → {keyword_leads} leads
- Top converting page: "{top_page}" → {page_conversion_rate}% CVR
- Experiments running: {experiment_count}

DECISIONS REQUIRED:
1. What do we scale? (proved ROI)
2. What do we kill? (no ROI, consuming resources)
3. What do we experiment next?
4. Are we on track to hit {target_mrr} MRR?

Rules:
- No "good progress" commentary
- Every decision must have a specific action
- Revenue attribution must be explicit
- Think in terms of compounding loops, not one-off campaigns
```

---

## 2. SEO Demand Capture — BOFU Page Brief

```
TARGET KEYWORD: "{keyword}"
SEARCH INTENT: {intent_description}
SEARCHER PROFILE: {buyer_persona}
COMPETING PAGES: {serp_analysis}

CREATE A PAGE THAT:
1. Answers the searcher's primary question in the first 100 words
2. Makes the value proposition immediately clear
3. Has social proof within the first scroll
4. Captures an email before the bottom of the page
5. Has internal links to {related_pages}

CONVERSION HIERARCHY:
Primary CTA: Book a 20-min call
Secondary CTA: Download {lead_magnet}
Tertiary CTA: Watch {demo_video}

TONE: Direct, specific, no adjectives unless preceded by a number
WORD COUNT: 1,200-1,800 words
SCHEMA: FAQ + Review aggregate
```

---

## 3. Authority Content — LinkedIn Post Framework

```
POST TYPE: {post_type}
WEEK THEME: {theme}
PAIN BEING ADDRESSED: {pain}

HOOK FORMULA (choose one):
- Contrarian: "Everyone says X. X is wrong. Here's what actually works:"
- Story: "6 months ago, {company} had 0 organic leads. Today: {result}."
- Insight: "The {metric} that predicts whether your {outcome} will compound or collapse:"
- Framework: "The only {concept} framework you need:"

STRUCTURE:
Line 1: Hook (max 12 words — must create scroll-stopping curiosity)
Lines 2-3: Setup / context
Lines 4-10: Substance / insight / story
Lines 11-14: Specific takeaway or framework
Line 15: CTA (ask a question or offer the resource)

INTENT SIGNALS TO WATCH:
- Comments asking "how did you do this?"
- DMs starting with "we're struggling with..."
- 3+ comments from same company domain
```

---

## 4. Inbound Conversion — Lead Scoring Model

```
LEAD: {lead_data}
SOURCE: {source_page} via "{source_keyword}"

SCORE EACH DIMENSION (0-100):

1. JOB TITLE FIT (0-25 points):
   - Decision maker (CEO, VP, Director): 25
   - Influencer (Manager, Lead): 15
   - IC (Engineer, Analyst): 8
   - Unknown: 5

2. COMPANY FIT (0-20 points):
   - Size 50-500 employees: 20
   - Size 10-50 employees: 15
   - Size 500+: 10
   - Unknown: 3

3. KEYWORD INTENT (0-20 points):
   - BOFU keyword (pricing, alternative, review): 20
   - MOFU keyword (how-to, comparison): 12
   - TOFU keyword (informational): 5

4. ENGAGEMENT DEPTH (0-20 points):
   - 3+ pages visited: 20
   - 2 pages: 12
   - 1 page: 5

5. BEHAVIORAL SIGNALS (0-15 points):
   - Visited pricing page: +10
   - Downloaded lead magnet: +8
   - Visited 2+ times: +5
   - Opened previous email: +3

COMPOSITE SCORE: weighted average
ROUTING: 70+ → immediate personal; 50-69 → auto nurture; <50 → light touch
```

---

## 5. Revenue Analytics — Attribution Model

```
REVENUE EVENT: ${amount} from {lead_email} on {date}

TOUCHPOINT SEQUENCE:
{touchpoints_ordered_by_date}

APPLY U-SHAPED ATTRIBUTION:
- First touch: 40% of ${amount}
- Last touch: 40% of ${amount}
- Middle touches: 20% split equally

FOR EACH TOUCHPOINT, RECORD:
- Content piece → gets revenue credit
- Keyword → gets revenue credit
- Channel → gets channel attribution

INSIGHTS TO SURFACE:
1. Which content piece initiated this customer's journey?
2. Which piece closed them?
3. Which keyword brought them to us?
4. How many days from first touch to revenue?

DECISION: Based on this attribution, what should we double down on?
```

---

## 6. Compounding Growth — Pattern Detection Prompt

```
ANALYZE THESE WINNING ASSETS:
{top_content_list}
{top_keyword_list}
{top_social_posts}

FIND PATTERNS THAT EXPLAIN SUCCESS:
1. Topic patterns: What subjects convert reliably?
2. Format patterns: What content structures work?
3. Hook patterns: What opening lines drive engagement?
4. CTA patterns: What asks convert?
5. Keyword patterns: Which intent clusters produce revenue?

FOR EACH PATTERN FOUND:
- Describe it precisely (not vaguely)
- Show evidence (3 data points minimum)
- Create a replication template
- Identify 5-10 new assets this pattern should be applied to

OUTPUT: A growth playbook, not an observation
```

---

## KPI THRESHOLDS — Paid Unlock Triggers

Organic must hit ALL THREE before paid channels activate:

| Metric | Threshold | Current | Status |
|--------|-----------|---------|--------|
| Organic leads/month | ≥ 50 | — | Locked |
| Form→lead CVR | ≥ 3% | — | Locked |
| CAC (organic) | ≤ $500 | — | Locked |
| Revenue attributed | ≥ $10K/mo | — | Locked |

When all 4 are green → Orchestrator unlocks paid growth module.
