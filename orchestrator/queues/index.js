import { Queue } from 'bullmq';
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
