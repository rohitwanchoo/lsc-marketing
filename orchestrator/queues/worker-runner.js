/**
 * BullMQ Worker Runner
 * Processes jobs from all agent queues concurrently
 */

import { Worker } from 'bullmq';
import { queues } from './index.js';
import { logger } from '../utils/logger.js';
import { query, queryOne } from '../utils/db.js';
import { slackClient } from '../integrations/slack.js';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────
// Consecutive failure tracker (in-memory, per agent)
// Resets on any successful job completion.
// ─────────────────────────────────────────────
const failureTracker = new Map();
// { agentName → { count, lastError, lastJobType, alertedAt } }

function recordFailure(agentName, jobType, errorMessage) {
  const current = failureTracker.get(agentName) || { count: 0, alertedAt: 0 };
  const updated  = { count: current.count + 1, lastError: errorMessage, lastJobType: jobType, alertedAt: current.alertedAt };
  failureTracker.set(agentName, updated);

  // Alert on 3rd consecutive failure (throttle: once per hour per agent)
  const now = Date.now();
  if (updated.count >= 3 && now - updated.alertedAt > 3_600_000) {
    updated.alertedAt = now;
    failureTracker.set(agentName, updated);
    slackClient.sendAgentFailureAlert({
      agent:                agentName,
      jobType,
      errorMessage,
      consecutiveFailures:  updated.count,
    }).catch(() => {});
  }
}

function resetFailures(agentName) {
  failureTracker.delete(agentName);
}

// Write a failure record to agent_runs for dashboard visibility
async function logJobFailure(agentName, job, err) {
  try {
    await query(
      `INSERT INTO agent_runs
         (id, agent, job_type, status, input, error, tokens_used, cost_usd, duration_ms, triggered_by, completed_at)
       VALUES ($1, $2::agent_name, $3, 'error', $4, $5, 0, 0,
               EXTRACT(EPOCH FROM (NOW() - COALESCE($6::timestamptz, NOW()))) * 1000,
               'worker', NOW())`,
      [
        uuidv4(),
        agentName,
        job?.name    || 'unknown',
        JSON.stringify(job?.data  || {}),
        err.message?.slice(0, 1000),
        job?.processedOn ? new Date(job.processedOn).toISOString() : null,
      ]
    );
  } catch { /* non-critical — DB may be down */ }
}

// Agent imports
import { SEODemandCaptureAgent }    from '../agents/seo-demand-capture.js';
import { AuthorityContentAgent }    from '../agents/authority-content.js';
import { SocialDistributionAgent }  from '../agents/social-distribution.js';
import { InboundConversionAgent }   from '../agents/inbound-conversion.js';
import { RevenueAnalyticsAgent }    from '../agents/revenue-analytics.js';
import { CompoundingGrowthAgent }   from '../agents/compounding-growth.js';
import { RevenueOrchestratorAgent } from '../agents/revenue-orchestrator.js';

// Instantiate agents (singletons)
const agents = {
  revenue_orchestrator: new RevenueOrchestratorAgent(),
  seo_demand_capture:   new SEODemandCaptureAgent(),
  authority_content:    new AuthorityContentAgent(),
  social_distribution:  new SocialDistributionAgent(),
  inbound_conversion:   new InboundConversionAgent(),
  revenue_analytics:    new RevenueAnalyticsAgent(),
  compounding_growth:   new CompoundingGrowthAgent(),
};

/**
 * Job router — maps job types to agent methods
 */
async function processJob(agentName, job) {
  const agent = agents[agentName];
  const { name: jobType, data: payload } = job;

  logger.info('Processing job', { agent: agentName, jobType, jobId: job.id });

  // SEO Demand Capture
  if (agentName === 'seo_demand_capture') {
    if (jobType === 'keyword_discovery')    return agent.discoverKeywords(payload);
    if (jobType === 'generate_page')        return agent.generatePage(payload);
    if (jobType === 'technical_audit')      return agent.technicalAudit();
    if (jobType === 'monitor_competitors')  return agent.monitorCompetitors();   // Tier 2
    if (jobType === 'bulk_generate_pages')  return agent.bulkGeneratePages(payload); // Tier 3
  }

  // Authority Content
  if (agentName === 'authority_content') {
    if (jobType === 'case_study')          return agent.generateCaseStudy(payload);
    if (jobType === 'linkedin_strategy')   return agent.generateLinkedInStrategy(payload);
    if (jobType === 'nurture_sequence')    return agent.generateNurtureSequence(payload);
    if (jobType === 'decay_remediation')   return agent.remediateDecayingContent();  // Tier 2
    if (jobType === 'repurpose_content')   return agent.repurposeContent(payload);
  }

  // Social Distribution
  if (agentName === 'social_distribution') {
    if (jobType === 'repurpose_content')   return agent.repurposeContent(payload);
    if (jobType === 'analyze_engagement')  return agent.analyzeEngagementSignals(payload);
    if (jobType === 'ab_variants')         return agent.generateABVariants(payload);
  }

  // Inbound Conversion
  if (agentName === 'inbound_conversion') {
    if (jobType === 'process_lead')        return agent.processNewLead(payload);
    if (jobType === 'follow_up')           return agent.generateFollowUp(payload);
    if (jobType === 'optimize_page')       return agent.optimizeLandingPage(payload);
    if (jobType === 'follow_up_queue')     return agent.processFollowUpQueue();
    if (jobType === 'recalibrate_scoring') return agent.recalibrateScoreWeights(); // Tier 2
  }

  // Revenue Analytics
  if (agentName === 'revenue_analytics') {
    if (jobType === 'weekly_intelligence') return agent.weeklyIntelligenceReport();
    if (jobType === 'attribute_revenue')   return agent.attributeRevenue(payload);
  }

  // Compounding Growth
  if (agentName === 'compounding_growth') {
    if (jobType === 'extract_patterns')    return agent.extractGrowthPatterns();
    if (jobType === 'scale_winner')        return agent.scaleWinner(payload);
    if (jobType === '90_day_roadmap')      return agent.generate90DayRoadmap();
  }

  // Orchestrator
  if (agentName === 'revenue_orchestrator') {
    if (jobType === 'weekly_review')       return agent.weeklyStrategicReview();
    if (jobType === 'daily_dispatch')      return agent.dailyDispatch();
  }

  throw new Error(`Unknown job type: ${jobType} for agent: ${agentName}`);
}

// Create workers for each agent queue
const workers = Object.keys(agents).map((agentName) => {
  const worker = new Worker(
    agentName,
    async (job) => processJob(agentName, job),
    {
      connection: queues.connection,
      concurrency: agentName === 'inbound_conversion' ? 10 : 3,
      limiter: { max: 5, duration: 60_000 }, // max 5 jobs/min per worker
    }
  );

  worker.on('completed', (job) => {
    logger.info('Job completed', { agent: agentName, jobType: job.name, jobId: job.id });
    resetFailures(agentName); // clear consecutive failure count on any success
  });

  worker.on('failed', async (job, err) => {
    logger.error('Job failed', {
      agent:    agentName,
      jobType:  job?.name,
      jobId:    job?.id,
      err:      err.message,
      attempts: job?.attemptsMade,
    });

    // Write to agent_runs for dashboard visibility
    await logJobFailure(agentName, job, err);

    // Track consecutive failures + alert via Slack after threshold
    recordFailure(agentName, job?.name || 'unknown', err.message);

    // Insert notification for dashboard visibility
    try {
      await query(
        `INSERT INTO notifications (type, title, message, metadata)
         VALUES ('agent_failure', $1, $2, $3::jsonb)`,
        [
          `Agent failure: ${agentName}`,
          `Job "${job?.name || 'unknown'}" failed: ${err.message?.slice(0, 200)}`,
          JSON.stringify({ agent: agentName, job_type: job?.name, job_id: job?.id }),
        ]
      );
    } catch { /* non-critical */ }

    // POST to alert_webhook if configured (fire-and-forget)
    queryOne(`SELECT config_json FROM integrations_config WHERE integration_name = 'alert_webhook' AND enabled = TRUE`)
      .then(row => {
        const webhookUrl = row?.config_json?.webhook_url;
        if (webhookUrl) {
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type:    'agent_failure',
              agent:   agentName,
              jobType: job?.name,
              error:   err.message,
              ts:      new Date().toISOString(),
            }),
          }).catch(() => {});
        }
      }).catch(() => {});
  });

  worker.on('stalled', (jobId) => {
    logger.warn('Job stalled', { agent: agentName, jobId });
  });

  logger.info(`Worker started: ${agentName}`);
  return worker;
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down workers...');
  await Promise.all(workers.map(w => w.close()));
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

logger.info(`All ${workers.length} agent workers running`);
