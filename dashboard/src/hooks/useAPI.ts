'use client';
import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

export function useAPI<T = any>(
  path: string,
  { interval = 30_000, enabled = true }: { interval?: number; enabled?: boolean } = {}
) {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`${API_BASE}${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path, enabled]);

  useEffect(() => {
    fetchData();
    if (interval > 0) {
      const t = setInterval(fetchData, interval);
      return () => clearInterval(t);
    }
  }, [fetchData, interval]);

  return { data, loading, error, refresh: fetchData };
}

const TRIGGER_KEY = process.env.NEXT_PUBLIC_TRIGGER_API_KEY || 'lsc-trigger-2026';

export async function apiPost(path: string, body: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (path.startsWith('/trigger/')) headers['X-Api-Key'] = TRIGGER_KEY;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function triggerAgent(agent: string, jobType: string, payload: any = {}) {
  return apiPost(`/trigger/${agent}/${jobType}`, payload);
}
