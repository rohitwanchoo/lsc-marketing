import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const connection = new IORedis({
  host:     config.redis.host,
  port:     config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on('connect',  () => logger.info('Redis connected'));
connection.on('error',    (err) => logger.error('Redis error', { err: err.message }));

// One queue per agent
const AGENT_QUEUES = {
  revenue_orchestrator:  new Queue('revenue_orchestrator',  { connection }),
  seo_demand_capture:    new Queue('seo_demand_capture',    { connection }),
  authority_content:     new Queue('authority_content',     { connection }),
  social_distribution:   new Queue('social_distribution',   { connection }),
  inbound_conversion:    new Queue('inbound_conversion',    { connection }),
  revenue_analytics:     new Queue('revenue_analytics',     { connection }),
  compounding_growth:    new Queue('compounding_growth',    { connection }),
};

// ─────────────────────────────────────────────
// Dead-letter queue: permanently failed jobs
// ─────────────────────────────────────────────
// We listen for the 'failed' event on each queue (after all retries exhausted)
// and write a notifications row so failures are visible in the dashboard.

async function _writeDLQNotification(agentName, jobId, jobName, failedReason) {
  try {
    // Lazy-import db to avoid circular dependency at module load time
    const { query: dbQuery } = await import('../utils/db.js');
    await dbQuery(
      `INSERT INTO notifications (type, title, message, metadata)
       VALUES ('agent_failure', $1, $2, $3)`,
      [
        `Agent job permanently failed: ${agentName}/${jobName}`,
        failedReason || 'Unknown error',
        JSON.stringify({ agentName, jobId, jobName, failedReason, timestamp: new Date().toISOString() }),
      ]
    );
    logger.warn('DLQ: permanent job failure recorded in notifications', {
      agentName, jobId, jobName, failedReason: (failedReason || '').substring(0, 200),
    });
  } catch (err) {
    logger.error('DLQ: failed to write notification', { err: err.message });
  }
}

// Attach QueueEvents listeners for each queue
for (const [agentName, queue] of Object.entries(AGENT_QUEUES)) {
  // QueueEvents requires a dedicated IORedis connection
  const eventsConnection = new IORedis({
    host:     config.redis.host,
    port:     config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queueEvents = new QueueEvents(queue.name, { connection: eventsConnection });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    // Retrieve the job to get its name/type — only act after all retries exhausted
    try {
      const job = await queue.getJob(jobId);
      if (!job) return;

      const attemptsUsed = job.attemptsMade || 0;
      const maxAttempts  = job.opts?.attempts || 3;

      // Only write to DLQ on final failure (all retries exhausted)
      if (attemptsUsed >= maxAttempts) {
        await _writeDLQNotification(agentName, jobId, job.name, failedReason);
      }
    } catch (err) {
      logger.error('QueueEvents failed handler error', { agentName, jobId, err: err.message });
    }
  });
}

export const queues = {
  /**
   * Dispatch a job to an agent's queue
   */
  async dispatch(agentName, jobType, payload = {}, options = {}) {
    const queue = AGENT_QUEUES[agentName];
    if (!queue) throw new Error(`Unknown agent queue: ${agentName}`);

    const job = await queue.add(jobType, payload, {
      attempts:     3,
      backoff:      { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      // Keep the last 50 failed jobs in Redis for inspection,
      // but permanent failures are also written to notifications table (DLQ).
      removeOnFail:     { count: 50 },
      ...options,
    });

    logger.info('Job dispatched', { queue: agentName, jobType, jobId: job.id });
    return job;
  },

  getQueue(agentName) {
    return AGENT_QUEUES[agentName];
  },

  getAllQueues() {
    return AGENT_QUEUES;
  },

  connection,
};
