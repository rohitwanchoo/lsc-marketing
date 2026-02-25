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

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  severity: 'info' | 'warning' | 'critical';
  read_at: string | null;
  created_at: string;
}

export function useNotifications(params: { unread?: boolean; limit?: number; type?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.unread) qs.set('unread', 'true');
  if (params.limit)  qs.set('limit', String(params.limit));
  if (params.type)   qs.set('type', params.type);
  const path = `/api/notifications${qs.toString() ? `?${qs}` : ''}`;
  return useAPI<Notification[]>(path, { interval: 30_000 });
}

export async function markNotificationRead(id: string) {
  const res = await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function markAllNotificationsRead() {
  const res = await fetch(`${API_BASE}/api/notifications/read-all`, { method: 'PATCH' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function deleteNotification(id: string) {
  const res = await fetch(`${API_BASE}/api/notifications/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Export Leads ─────────────────────────────────────────────────────────────

export function useExportLeads() {
  return function exportLeads(params: { format?: 'csv' | 'json'; stage?: string; dateFrom?: string; dateTo?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.format)   qs.set('format', params.format);
    if (params.stage)    qs.set('stage', params.stage);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo)   qs.set('dateTo', params.dateTo);
    const url = `${API_BASE}/api/export/leads${qs.toString() ? `?${qs}` : ''}`;
    window.open(url, '_blank');
  };
}

// ─── Products ─────────────────────────────────────────────────────────────────

export function useProducts() {
  return useAPI<any[]>('/api/products', { interval: 60_000 });
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export function useIntegrations() {
  return useAPI<any[]>('/api/integrations', { interval: 60_000 });
}

export async function patchIntegration(name: string, body: { enabled?: boolean; webhook_url?: string; config?: Record<string, any> }) {
  const res = await fetch(`${API_BASE}/api/integrations/${name}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
