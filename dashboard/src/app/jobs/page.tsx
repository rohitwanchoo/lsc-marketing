'use client';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Clock, CheckCircle, XCircle, Loader2,
  RefreshCw, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

// ── agent display names ──────────────────────────────────────────────────────
const AGENT_LABELS: Record<string, string> = {
  revenue_orchestrator: 'Revenue Orchestrator',
  seo_demand_capture:   'SEO Demand Capture',
  authority_content:    'Authority Content',
  social_distribution:  'Social Distribution',
  inbound_conversion:   'Inbound Conversion',
  revenue_analytics:    'Revenue Analytics',
  compounding_growth:   'Compounding Growth',
};

const AGENT_COLORS: Record<string, string> = {
  revenue_orchestrator: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  seo_demand_capture:   'text-blue-400   bg-blue-400/10   border-blue-400/20',
  authority_content:    'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  social_distribution:  'text-pink-400   bg-pink-400/10   border-pink-400/20',
  inbound_conversion:   'text-green-400  bg-green-400/10  border-green-400/20',
  revenue_analytics:    'text-orange-400 bg-orange-400/10 border-orange-400/20',
  compounding_growth:   'text-cyan-400   bg-cyan-400/10   border-cyan-400/20',
};

// ── types ────────────────────────────────────────────────────────────────────
interface LiveJob {
  id: string;
  agent: string;
  jobType: string;
  status: 'running' | 'queued';
  startedAt?: string | null;
  queuedAt?: string | null;
  priority?: number;
  attempts?: number;
}

interface HistoryJob {
  id: string;
  agent: string;
  job_type: string;
  status: 'success' | 'failed' | 'running';
  tokens_used: number;
  cost_usd: number;
  duration_ms: number;
  error: string | null;
  started_at: string;
  completed_at: string;
}

interface JobsData {
  active:  LiveJob[];
  waiting: LiveJob[];
  history: HistoryJob[];
}

// ── helpers ──────────────────────────────────────────────────────────────────
function elapsed(isoDate?: string | null) {
  if (!isoDate) return '—';
  const sec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function duration(ms: number) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function fmtCost(usd: number) {
  if (!usd) return '—';
  return `$${usd.toFixed(4)}`;
}

function AgentBadge({ agent }: { agent: string }) {
  const cls = AGENT_COLORS[agent] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${cls}`}>
      {AGENT_LABELS[agent] ?? agent}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === 'running') return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />;
  if (status === 'queued')  return <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />;
  if (status === 'success') return <CheckCircle size={14} className="text-green-400 inline" />;
  if (status === 'failed')  return <XCircle size={14} className="text-red-400 inline" />;
  return null;
}

// ── main page ────────────────────────────────────────────────────────────────
export default function JobsPage() {
  const [data, setData]         = useState<JobsData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLast]  = useState(Date.now());
  const [showAll, setShowAll]   = useState(false);
  const [expandedId, setExp]    = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/jobs`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
    setLast(Date.now());
  }, []);

  useEffect(() => {
    fetch_();
    const iv = setInterval(fetch_, 3000);
    return () => clearInterval(iv);
  }, [fetch_]);

  const active  = data?.active  ?? [];
  const waiting = data?.waiting ?? [];
  const history = data?.history ?? [];
  const visibleHistory = showAll ? history : history.slice(0, 20);

  const totalRunning = active.length;
  const totalQueued  = waiting.length;
  const todayFailed  = history.filter(h =>
    h.status === 'failed' &&
    new Date(h.completed_at) > new Date(Date.now() - 86400_000)
  ).length;
  const todayCost = history
    .filter(h => new Date(h.completed_at) > new Date(Date.now() - 86400_000))
    .reduce((s, h) => s + (h.cost_usd ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Job Queue</h1>
          <p className="text-xs text-gray-500 mt-0.5">Live view of all agent jobs — refreshes every 3 seconds</p>
        </div>
        <button
          onClick={fetch_}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-xs transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Running',      value: totalRunning, icon: <Loader2 size={16} className="text-blue-400 animate-spin" />,  color: 'border-blue-400/20'   },
          { label: 'Queued',       value: totalQueued,  icon: <Clock size={16} className="text-yellow-400" />,               color: 'border-yellow-400/20' },
          { label: "Today's AI cost", value: `$${todayCost.toFixed(3)}`, icon: <Zap size={16} className="text-green-400" />, color: 'border-green-400/20'  },
          { label: 'Failed today', value: todayFailed,  icon: <XCircle size={16} className="text-red-400" />,               color: 'border-red-400/20'    },
        ].map(c => (
          <div key={c.label} className={`bg-gray-900 border ${c.color} rounded-xl p-4 flex items-center gap-3`}>
            {c.icon}
            <div>
              <div className="text-lg font-bold text-white">{c.value}</div>
              <div className="text-[10px] text-gray-500">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Running now */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Running now ({active.length})
        </h2>
        {active.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-600 text-center">
            No jobs currently running
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(job => (
              <div key={job.id} className="bg-gray-900 border border-blue-400/20 rounded-xl px-4 py-3 flex items-center gap-4">
                <Loader2 size={14} className="text-blue-400 animate-spin shrink-0" />
                <AgentBadge agent={job.agent} />
                <span className="text-sm text-white font-mono">{job.jobType}</span>
                <span className="text-xs text-gray-500 ml-auto">started {elapsed(job.startedAt)}</span>
                {(job.attempts ?? 0) > 0 && (
                  <span className="text-[10px] text-yellow-500 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded">
                    attempt {job.attempts}
                  </span>
                )}
                <span className="text-[10px] text-gray-600">#{job.id}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Waiting in queue */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400" />
          Waiting in queue ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-600 text-center">
            Queue is empty
          </div>
        ) : (
          <div className="space-y-2">
            {waiting.map((job, i) => (
              <div key={job.id} className="bg-gray-900 border border-yellow-400/10 rounded-xl px-4 py-3 flex items-center gap-4">
                <span className="text-xs text-gray-600 w-5 text-right shrink-0">{i + 1}</span>
                <AgentBadge agent={job.agent} />
                <span className="text-sm text-white font-mono">{job.jobType}</span>
                <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                  priority {job.priority}
                </span>
                <span className="text-xs text-gray-500 ml-auto">queued {elapsed(job.queuedAt)}</span>
                <span className="text-[10px] text-gray-600">#{job.id}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Recent history ({history.length})
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-[11px] text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-2.5">Agent</th>
                <th className="text-left px-4 py-2.5">Job</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Duration</th>
                <th className="text-right px-4 py-2.5">Tokens</th>
                <th className="text-right px-4 py-2.5">Cost</th>
                <th className="text-right px-4 py-2.5">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-600">Loading…</td>
                </tr>
              )}
              {visibleHistory.map(h => (
                <React.Fragment key={h.id}>
                  <tr
                    className="hover:bg-gray-800/40 cursor-pointer transition-colors"
                    onClick={() => setExp(expandedId === h.id ? null : h.id)}
                  >
                    <td className="px-4 py-2.5">
                      <AgentBadge agent={h.agent} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{h.job_type}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                        h.status === 'success' ? 'text-green-400' :
                        h.status === 'failed'  ? 'text-red-400'   : 'text-blue-400'
                      }`}>
                        <StatusDot status={h.status} />
                        {h.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400">{duration(h.duration_ms)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400">{h.tokens_used?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400">{fmtCost(h.cost_usd)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-500">
                      <span className="flex items-center justify-end gap-1">
                        {elapsed(h.completed_at)}
                        {expandedId === h.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </span>
                    </td>
                  </tr>
                  {expandedId === h.id && (
                    <tr className="bg-gray-800/30">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="text-gray-500 mb-1">Job ID</div>
                            <div className="font-mono text-gray-300">{h.id}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 mb-1">Started</div>
                            <div className="text-gray-300">{h.started_at ? new Date(h.started_at).toLocaleString() : '—'}</div>
                          </div>
                          {h.error && (
                            <div className="col-span-2">
                              <div className="text-red-400 mb-1">Error</div>
                              <div className="font-mono text-red-300 bg-red-900/20 border border-red-400/20 rounded p-2 whitespace-pre-wrap break-all">
                                {h.error}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>

          {history.length > 20 && (
            <div className="border-t border-gray-800 px-4 py-3 text-center">
              <button
                onClick={() => setShowAll(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 mx-auto"
              >
                {showAll ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all {history.length} runs</>}
              </button>
            </div>
          )}
        </div>

        {/* Last refresh indicator */}
        <div className="text-[10px] text-gray-700 text-right mt-2">
          Last updated {new Date(lastRefresh).toLocaleTimeString()}
        </div>
      </section>
    </div>
  );
}
