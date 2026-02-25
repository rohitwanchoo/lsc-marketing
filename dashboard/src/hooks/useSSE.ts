'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export interface ActivityEvent {
  id:   string;
  type: string;
  data: Record<string, any>;
  ts:   string;
}

const EVENT_TYPES = [
  'lead.scored',
  'lead.stage_changed',
  'content.published',
  'intent_spike',
  'connected',
];

/**
 * Connect to the orchestrator's SSE live-activity stream.
 * Reconnects automatically on disconnect.
 */
export function useSSE(path: string = '/api/live-activity', maxEvents = 150) {
  const [events,    setEvents]    = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const esRef     = useRef<EventSource | null>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    const es = new EventSource(`${API_BASE}${path}`);
    esRef.current = es;

    // Confirm connection
    es.addEventListener('connected', () => {
      setConnected(true);
      setError(null);
    });

    // Listen for all named event types
    for (const type of EVENT_TYPES) {
      if (type === 'connected') continue;
      es.addEventListener(type, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setEvents(prev => [
            {
              id:   `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              type,
              data,
              ts:   data.ts || new Date().toISOString(),
            },
            ...prev,
          ].slice(0, maxEvents));
        } catch { /* malformed SSE data */ }
      });
    }

    es.onerror = () => {
      if (unmounted.current) return;
      setConnected(false);
      setError('Connection lost — reconnecting…');
      es.close();
      timerRef.current = setTimeout(connect, 3_500);
    };
  }, [path, maxEvents]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      esRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      setConnected(false);
    };
  }, [connect]);

  const clear = useCallback(() => setEvents([]), []);

  return { events, connected, error, clear };
}
