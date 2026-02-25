/**
 * Autonomous Growth Loop Scheduler
 *
 * Runs continuously without human input.
 * Schedule: Plan → Execute → Measure → Learn → Optimize → Scale
 */

import cron from 'node-cron';
import { queues } from '../queues/index.js';
import { logger } from '../utils/logger.js';
import { queryOne, queryAll } from '../utils/db.js';
import { gscClient } from '../integrations/google-search-console.js';
import { linkedinClient } from '../integrations/linkedin.js';
import { emailClient } from '../integrations/sendgrid.js';
import { hubspotClient } from '../integrations/hubspot.js';

const log = logger.child({ component: 'autonomous-loop' });

export async function startAutonomousLoop() {
  log.info('Starting autonomous growth loop');

  // ─────────────────────────────────────────────
  // DAILY LOOPS
  // ─────────────────────────────────────────────

  // 06:00 Daily: Orchestrator dispatches today's priorities
  cron.schedule('0 6 * * *', async () => {
    log.info('CRON: Daily dispatch');
    await queues.dispatch('revenue_orchestrator', 'daily_dispatch', {}, { priority: 1 });
  });

  // 07:00 Daily: SEO audit of low-converting published pages
  cron.schedule('0 7 * * *', async () => {
    log.info('CRON: SEO technical audit');
    await queues.dispatch('seo_demand_capture', 'technical_audit', {}, { priority: 3 });
  });

  // 09:00 Daily: Follow-up queue — every lead gets touched
  cron.schedule('0 9 * * *', async () => {
    log.info('CRON: Follow-up queue processing');
    await queues.dispatch('inbound_conversion', 'follow_up_queue', {}, { priority: 2 });
  });

  // 12:00 Daily: Repurpose any newly published content to social
  cron.schedule('0 12 * * *', async () => {
    log.info('CRON: Content repurposing check');
    try {
      // Find content published in last 24h not yet repurposed
      const newContent = await queryOne(
        `SELECT id FROM content_assets
         WHERE status = 'published'
           AND published_at >= NOW() - INTERVAL '24 hours'
           AND id NOT IN (SELECT DISTINCT content_asset_id FROM social_posts WHERE content_asset_id IS NOT NULL)
         LIMIT 1`
      );
      if (newContent) {
        await queues.dispatch('social_distribution', 'repurpose_content', {
          contentAssetId: newContent.id,
          platforms: ['linkedin', 'twitter'],
        }, { priority: 4 });
      }
    } catch (err) {
      log.error('Repurpose cron failed', { err: err.message });
    }
  });

  // 18:00 Daily: Engagement signal analysis (end of business day)
  cron.schedule('0 18 * * *', async () => {
    log.info('CRON: Engagement signal analysis');
    await queues.dispatch('social_distribution', 'analyze_engagement', {
      platform: 'linkedin',
      engagementData: [], // populated by integration layer
    }, { priority: 5 });
  });

  // ─────────────────────────────────────────────
  // WEEKLY LOOPS
  // ─────────────────────────────────────────────

  // Every Monday 05:00: Full strategic review
  cron.schedule('0 5 * * 1', async () => {
    log.info('CRON: Weekly strategic review');
    await queues.dispatch('revenue_orchestrator', 'weekly_review', {}, { priority: 1 });
  });

  // Every Monday 08:00: Weekly revenue intelligence report
  cron.schedule('0 8 * * 1', async () => {
    log.info('CRON: Weekly revenue intelligence');
    await queues.dispatch('revenue_analytics', 'weekly_intelligence', {}, { priority: 2 });
  });

  // Every Tuesday 09:00: New LinkedIn content strategy for the week
  cron.schedule('0 9 * * 2', async () => {
    log.info('CRON: LinkedIn weekly content strategy');
    await queues.dispatch('authority_content', 'linkedin_strategy', {
      weekTheme: 'auto', // orchestrator fills this in from dispatch
      recentWins: [],
      icp: 'B2B SaaS founders',
      painPoints: ['slow lead gen', 'high CAC', 'no organic presence'],
    }, { priority: 3 });
  });

  // Every Wednesday 10:00: Keyword discovery for new BOFU opportunities
  cron.schedule('0 10 * * 3', async () => {
    log.info('CRON: Weekly keyword discovery');
    await queues.dispatch('seo_demand_capture', 'keyword_discovery', {
      seedKeywords: [],
      competitors: [],
    }, { priority: 3 });
  });

  // Every Thursday 14:00: Extract growth patterns and update playbooks
  cron.schedule('0 14 * * 4', async () => {
    log.info('CRON: Growth pattern extraction');
    await queues.dispatch('compounding_growth', 'extract_patterns', {}, { priority: 4 });
  });

  // Every Friday 10:00: Competitor keyword monitoring (Tier 2 - Gap 6)
  cron.schedule('0 10 * * 5', async () => {
    log.info('CRON: Competitor keyword monitoring');
    await queues.dispatch('seo_demand_capture', 'monitor_competitors', {}, { priority: 3 });
  });

  // Every Wednesday 11:00: Content decay remediation (Tier 2 - Gap 8)
  cron.schedule('0 11 * * 3', async () => {
    log.info('CRON: Content decay remediation');
    await queues.dispatch('authority_content', 'decay_remediation', {}, { priority: 3 });
  });

  // ─────────────────────────────────────────────
  // MONTHLY LOOPS
  // ─────────────────────────────────────────────

  // 1st of month at 06:00: Generate 90-day roadmap
  cron.schedule('0 6 1 * *', async () => {
    log.info('CRON: Monthly 90-day roadmap generation');
    await queues.dispatch('compounding_growth', '90_day_roadmap', {}, { priority: 2 });
  });

  // 15th of month: Mid-month goal check and rebalance
  cron.schedule('0 9 15 * *', async () => {
    log.info('CRON: Mid-month goal rebalance');
    await queues.dispatch('revenue_orchestrator', 'weekly_review', {
      mode: 'mid_month_rebalance',
    }, { priority: 2 });
  });

  // ─────────────────────────────────────────────
  // HIGH-FREQUENCY (every 4 hours)
  // ─────────────────────────────────────────────

  // Lead scoring: process any new unscored leads
  cron.schedule('0 */4 * * *', async () => {
    try {
      const unscored = await queryOne(
        `SELECT id FROM leads WHERE composite_score = 0 AND stage = 'prospect' LIMIT 1`
      );
      if (unscored) {
        await queues.dispatch('inbound_conversion', 'process_lead', {
          leadId: unscored.id,
          leadData: {},
          sourcePage: 'unknown',
          sourceKeyword: 'unknown',
        }, { priority: 1 });
      }
    } catch (err) {
      log.error('Lead scoring cron failed', { err: err.message });
    }
  });

  // ─────────────────────────────────────────────
  // INTEGRATION SYNCS
  // ─────────────────────────────────────────────

  // GSC rank sync — twice daily (06:30 and 18:30)
  cron.schedule('30 6,18 * * *', async () => {
    log.info('CRON: GSC rank sync');
    try { await gscClient.syncToDatabase(); } catch (err) { log.error('GSC sync failed', { err: err.message }); }
  });

  // LinkedIn scheduled posts — every 30 min
  cron.schedule('*/30 * * * *', async () => {
    try { await linkedinClient.publishScheduledPosts(); } catch (err) { log.error('LinkedIn publish failed', { err: err.message }); }
  });

  // LinkedIn engagement analytics — every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    try { await linkedinClient.syncEngagementData(); } catch (err) { log.error('LinkedIn analytics sync failed', { err: err.message }); }
  });

  // Nurture email queue — every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try { await emailClient.runNurtureQueue(); } catch (err) { log.error('Nurture queue failed', { err: err.message }); }
  });

  // HubSpot CRM sync — hourly
  cron.schedule('0 * * * *', async () => {
    try { await hubspotClient.bulkSync(); } catch (err) { log.error('HubSpot sync failed', { err: err.message }); }
  });

  log.info('All cron schedules registered', {
    daily:         5,
    weekly:        7,  // +2 Tier 2: competitor monitoring, decay remediation
    monthly:       2,
    highFrequency: 1,
  });

  // Load DB-driven schedules (agent_schedules table)
  await startDbDrivenSchedules();
}

/**
 * Load agent schedules from DB and register dynamic cron jobs.
 * Respects max_daily_cost guardrail per agent.
 */
async function startDbDrivenSchedules() {
  try {
    const schedules = await queryAll(`SELECT * FROM agent_schedules WHERE enabled = TRUE`);
    log.info('Loading DB-driven schedules', { count: schedules.length });

    for (const schedule of schedules) {
      const { agent_name, job_type, cron_expression, max_daily_cost } = schedule;

      if (!cron.validate(cron_expression)) {
        log.warn('Invalid cron expression in DB schedule', { agent_name, job_type, cron_expression });
        continue;
      }

      cron.schedule(cron_expression, async () => {
        try {
          // Cost guardrail — skip if today's spend exceeds max
          if (max_daily_cost) {
            const todaySpend = await queryOne(
              `SELECT SUM(cost_usd) AS spent FROM agent_runs WHERE started_at >= CURRENT_DATE AND agent = $1`,
              [agent_name]
            );
            if (parseFloat(todaySpend?.spent || 0) >= parseFloat(max_daily_cost)) {
              log.warn('Cost guardrail hit — skipping job', { agent_name, job_type, max_daily_cost });
              return;
            }
          }

          log.info('DB-driven cron dispatch', { agent_name, job_type });
          await queues.dispatch(agent_name, job_type, {}, { priority: 3 });
        } catch (err) {
          log.error('DB-driven cron failed', { agent_name, job_type, err: err.message });
        }
      });
    }

    log.info('DB-driven schedules registered', { count: schedules.length });
  } catch (err) {
    // Table may not exist yet on first boot before migration
    log.warn('Could not load DB-driven schedules', { err: err.message });
  }
}
