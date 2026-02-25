/**
 * SSE Broadcaster
 *
 * Standalone module — no circular import risk.
 * Maintains a registry of active Server-Sent Event client connections.
 * Any agent or integration can import broadcast() without depending on server.js.
 *
 * Usage (from Express route):
 *   const id = registerClient(res);
 *   req.on('close', () => unregisterClient(id));
 *
 * Usage (from any module):
 *   broadcast('lead.scored', { leadId, compositeScore });
 */

import { agentLogger } from './logger.js';

const log = agentLogger('sse');

// Map of clientId → Express response object
const clients = new Map();
let _nextId = 1;

/**
 * Register a new SSE client connection.
 * The caller must set the correct SSE headers before calling this.
 * Returns the client ID — pass it to unregisterClient when the connection closes.
 */
export function registerClient(res) {
  const id = _nextId++;
  clients.set(id, res);
  log.debug('SSE client connected', { id, total: clients.size });
  return id;
}

/**
 * Remove a disconnected SSE client.
 */
export function unregisterClient(id) {
  clients.delete(id);
  log.debug('SSE client disconnected', { id, total: clients.size });
}

/**
 * Broadcast a named event to all connected SSE clients.
 * Silently drops stale connections (write errors).
 *
 * @param {string} eventName  e.g. 'lead.scored', 'intent_spike'
 * @param {object} data       JSON-serializable payload
 */
export function broadcast(eventName, data) {
  if (!clients.size) return;

  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  let dropped = 0;

  for (const [id, res] of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(id);
      dropped++;
    }
  }

  if (dropped) log.debug('Dropped stale SSE clients', { dropped });
  log.debug('SSE broadcast', { event: eventName, clients: clients.size });
}

/**
 * Returns the number of currently connected SSE clients.
 */
export function clientCount() {
  return clients.size;
}
