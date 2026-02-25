-- Initial BOFU/MOFU seed keywords for immediate targeting
-- These are high-intent keywords that drive revenue conversations

INSERT INTO keywords (keyword, intent, search_volume, difficulty, cpc_usd, priority_score) VALUES
-- BOFU: Alternative / Competitor keywords (highest intent)
('best marketing automation software',       'BOFU', 5400, 68, 12.50, 92),
('hubspot alternative',                       'BOFU', 8100, 71, 15.20, 90),
('marketo alternative',                       'BOFU', 3600, 65, 18.40, 88),
('marketing automation pricing',              'BOFU', 2900, 55, 14.80, 87),
('marketing automation software comparison',  'BOFU', 1900, 62, 11.20, 85),
('ai marketing automation',                   'BOFU', 4400, 58, 13.60, 89),
('autonomous marketing platform',             'BOFU',  880, 42,  9.80, 91),
('seo automation software',                   'BOFU', 2200, 60, 10.40, 83),
('content marketing automation',              'MOFU', 3300, 63,  8.90, 78),
-- MOFU: Problem-aware keywords
('how to generate organic leads b2b',         'MOFU', 1600, 48,  6.20, 75),
('organic lead generation strategy',          'MOFU', 2100, 51,  7.40, 76),
('b2b seo strategy 2026',                     'MOFU', 3800, 55,  8.10, 72),
('reduce customer acquisition cost',          'MOFU', 1200, 44,  9.60, 74),
('seo content that converts',                 'MOFU', 1800, 52,  7.80, 73),
('inbound lead generation saas',              'MOFU', 2400, 57,  8.50, 76),
-- Use-case keywords
('ai seo content generation',                 'MOFU', 2900, 61,  9.20, 77),
('automated linkedin outreach',               'BOFU', 1700, 49,  8.80, 80),
('email nurture sequence automation',         'MOFU', 1400, 46,  7.60, 72)
ON CONFLICT (keyword) DO NOTHING;
