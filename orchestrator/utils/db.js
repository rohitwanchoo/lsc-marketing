import pg from 'pg';
import { config } from '../config.js';
import { logger } from './logger.js';

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     config.db.host,
      port:     config.db.port,
      database: config.db.name,
      user:     config.db.user,
      password: config.db.password,
      max:      20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    pool.on('error', (err) => logger.error('PG pool error', { err: err.message }));
  }
  return pool;
}

export async function query(sql, params = []) {
  const pool = getPool();
  const start = Date.now();
  try {
    const result = await pool.query(sql, params);
    logger.debug('DB query', { sql: sql.substring(0, 60), duration: Date.now() - start });
    return result;
  } catch (err) {
    logger.error('DB query failed', { sql: sql.substring(0, 80), err: err.message });
    throw err;
  }
}

export async function queryOne(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

export async function queryAll(sql, params = []) {
  const result = await query(sql, params);
  return result.rows;
}

export async function transaction(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
