# 90-Day Organic Revenue Roadmap
## LSC Marketing Automation Platform

**Goal:** Consistent organic revenue without paid ads
**Metric:** MRR from organic-only sources

---

## MONTH 1: FOUNDATION (Weeks 1-4)
**Theme: Capture Existing Demand**
**Revenue Target:** $0 → $5,000 MRR

### Week 1 — BOFU Infrastructure
- [ ] Deploy platform & run setup.sh
- [ ] Configure ANTHROPIC_API_KEY, DB, Redis
- [ ] Trigger: `seo_demand_capture` → `keyword_discovery` (seed with top 5 competitors)
- [ ] Generate 5 BOFU landing pages (alternative pages, pricing page, comparison page)
- [ ] Set up lead capture webhook → CRM sync
- **Expected:** 0-5 leads (infrastructure week)

### Week 2 — Authority Signals
- [ ] `authority_content` → `linkedin_strategy` (5-post week 1 plan)
- [ ] Publish 3 LinkedIn posts (founder voice, pain-led)
- [ ] `authority_content` → `nurture_sequence` for MQL stage
- [ ] Set up email sending via SendGrid
- **Expected:** 5-15 leads, 0 revenue yet

### Week 3 — Conversion Optimization
- [ ] Review landing page performance → `inbound_conversion` → `optimize_page`
- [ ] Launch first A/B experiment (headline variation)
- [ ] `social_distribution` → `repurpose_content` for all 5 pages
- [ ] First follow-up sequences firing
- **Expected:** 15-25 leads, first calls booked

### Week 4 — First Revenue
- [ ] `revenue_orchestrator` → first weekly strategic review
- [ ] Kill any page with <0.3% CVR
- [ ] Scale any page with >2% CVR
- [ ] First case study drafted from early call wins
- **Expected:** 25-40 leads, $1,000-$5,000 MRR

---

## MONTH 2: ACCELERATION (Weeks 5-8)
**Theme: Expand What Works**
**Revenue Target:** $5,000 → $20,000 MRR

### Week 5-6 — Keyword Expansion
- [ ] `compounding_growth` → `extract_patterns` from Month 1 winners
- [ ] `seo_demand_capture` → expand winning keyword clusters (5-10 sibling pages)
- [ ] `revenue_analytics` → identify highest-revenue content → scale pattern
- **Expected:** 40-60 leads/month, first compounding effect visible

### Week 7-8 — Social Authority
- [ ] LinkedIn posts consistently generating DMs → CRM pipeline
- [ ] First case study published → repurposed to 4 channels
- [ ] `inbound_conversion` → high-intent lead blitz protocol active
- [ ] `authority_content` → 2nd nurture sequence (SQL stage)
- **Expected:** 60-80 leads/month, $10,000+ MRR

---

## MONTH 3: COMPOUNDING (Weeks 9-12)
**Theme: Make Growth Inevitable**
**Revenue Target:** $20,000 → $50,000+ MRR

### Week 9-10 — Playbook Execution
- [ ] 3+ growth playbooks running autonomously
- [ ] `compounding_growth` → `90_day_roadmap` refresh
- [ ] 20+ published pages in the BOFU cluster
- [ ] Experiment engine running 5+ concurrent tests

### Week 11-12 — Paid Unlock Check
- [ ] `revenue_analytics` → `paid_unlock_check`
- [ ] If organic ≥ 50 leads/mo + 3% CVR + CAC ≤ $500 → unlock paid module
- [ ] `revenue_orchestrator` → Month 4 goals set
- **Expected:** 80-120 leads/month, $30,000-$50,000 MRR

---

## PAID CHANNEL UNLOCK THRESHOLDS

Before activating ANY paid spend, organic MUST achieve:

| # | Metric | Required Threshold | Why |
|---|--------|--------------------|-----|
| 1 | Organic leads/month | ≥ 50 | Prove channel works |
| 2 | Form → lead CVR | ≥ 3% | Prove conversion works |
| 3 | CAC (organic) | ≤ $500 | Prove economics |
| 4 | Revenue attributed to organic | ≥ $10,000/mo | Prove ROI |

**When unlocked:**
- Start with search intent ads (same BOFU keywords already proven)
- Budget = 10% of organic revenue
- ROAS target = 3x minimum before scaling

---

## COMPOUNDING EFFECT PROJECTIONS

```
Month 1: 40 leads → 2 customers → $4,000 MRR
Month 2: 70 leads → 5 customers → $14,000 MRR (+$10K)
Month 3: 110 leads → 10 customers → $34,000 MRR (+$20K)
Month 4: 160 leads → 15 customers → $64,000 MRR (+$30K)
Month 6: 300 leads → 30 customers → $124,000 MRR (+$60K)
```

The compounding effect is real: every piece of content added to the BOFU cluster
strengthens the ones around it (internal linking, topical authority, SERP cluster domination).

---

## WEEKLY REVIEW CHECKLIST (Autonomous)

Every Monday, the Revenue Orchestrator automatically:

1. Pulls all KPIs from last 7 days
2. Compares against weekly targets
3. Identifies top 3 content pieces by revenue attribution
4. Kills anything with <0.5% CVR and >500 views
5. Scales anything with >3% CVR
6. Dispatches next week's agent priorities
7. Updates growth playbooks with new learnings
8. Checks paid unlock thresholds

**Human required:** 0 minutes/week (except reviewing the weekly summary email)
