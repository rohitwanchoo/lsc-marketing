-- Foundational growth playbooks pre-loaded into the system

INSERT INTO playbooks (name, category, description, trigger_conditions, action_steps, created_by) VALUES

('BOFU Keyword Page Pattern',
 'keyword_strategy',
 'When a BOFU keyword has search volume > 1000 and difficulty < 70, generate a conversion-first landing page within 48 hours',
 '{"keyword_intent": "BOFU", "min_volume": 1000, "max_difficulty": 70}',
 '[
   {"step": 1, "agent": "seo_demand_capture", "action": "generate_page", "params": {"page_type": "landing_page"}},
   {"step": 2, "agent": "authority_content", "action": "generate_case_study", "params": {"reference_page": true}},
   {"step": 3, "agent": "inbound_conversion", "action": "optimize_page", "params": {"a_b_test": true}},
   {"step": 4, "agent": "social_distribution", "action": "repurpose_content", "params": {"platforms": ["linkedin"]}}
 ]',
 'compounding_growth'),

('Content→Social→Lead Loop',
 'content_pattern',
 'Every published SEO page gets repurposed into LinkedIn content within 24h, driving profile visits that convert to leads',
 '{"trigger": "content_published", "content_type": ["landing_page", "case_study", "comparison"]}',
 '[
   {"step": 1, "agent": "social_distribution", "action": "repurpose_content", "params": {"platforms": ["linkedin", "twitter"]}},
   {"step": 2, "agent": "social_distribution", "action": "analyze_engagement", "params": {"delay_hours": 48}},
   {"step": 3, "agent": "inbound_conversion", "action": "process_lead", "params": {"source": "social_intent"}}
 ]',
 'compounding_growth'),

('High-Intent Lead Blitz',
 'nurture_sequence',
 'When a lead scores 70+ composite, trigger immediate personalized outreach within 5 minutes — no delays',
 '{"min_composite_score": 70, "trigger": "lead_scored"}',
 '[
   {"step": 1, "agent": "inbound_conversion", "action": "follow_up", "params": {"channel": "email", "delay_minutes": 5}},
   {"step": 2, "agent": "inbound_conversion", "action": "follow_up", "params": {"channel": "linkedin", "delay_hours": 24}},
   {"step": 3, "agent": "inbound_conversion", "action": "follow_up", "params": {"channel": "email", "delay_hours": 48, "type": "value_add"}}
 ]',
 'revenue_orchestrator'),

('Underperformer Kill Rule',
 'content_pattern',
 'Any published page with > 500 pageviews and < 0.5% conversion rate gets flagged for kill or major rewrite after 30 days',
 '{"min_pageviews": 500, "max_conversion_rate": 0.005, "age_days": 30}',
 '[
   {"step": 1, "agent": "revenue_analytics", "action": "audit_page", "params": {}},
   {"step": 2, "agent": "seo_demand_capture", "action": "technical_audit", "params": {}},
   {"step": 3, "agent": "revenue_orchestrator", "action": "kill_or_rewrite_decision", "params": {}}
 ]',
 'revenue_analytics'),

('Winner Scaling Protocol',
 'keyword_strategy',
 'When a page achieves > 3% conversion rate and > 10 leads, identify 5 related keyword variations and create sibling pages',
 '{"min_conversion_rate": 0.03, "min_leads": 10, "trigger": "page_performance_review"}',
 '[
   {"step": 1, "agent": "compounding_growth", "action": "extract_patterns", "params": {"focus": "keyword_cluster"}},
   {"step": 2, "agent": "seo_demand_capture", "action": "keyword_discovery", "params": {"seed_from_winner": true}},
   {"step": 3, "agent": "seo_demand_capture", "action": "generate_page", "params": {"use_winner_template": true}},
   {"step": 4, "agent": "inbound_conversion", "action": "optimize_page", "params": {}}
 ]',
 'compounding_growth')

ON CONFLICT DO NOTHING;
