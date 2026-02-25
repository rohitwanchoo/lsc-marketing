'use client';
import { useState } from 'react';
import { useAPI, triggerAgent } from '@/hooks/useAPI';
import { Activity, Zap, CheckCircle, AlertCircle, RefreshCw, Clock, DollarSign, Calendar, Eye, X } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

// ── Schedule Editor Modal ─────────────────────────────────────────────────────
function ScheduleModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { data: schedules, refresh } = useAPI<any[]>('/api/agents/schedules', { interval: 0 });
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits]   = useState<Record<string, { cron: string; enabled: boolean; maxCost: string }>>({});

  const agentSchedules = Array.isArray(schedules)
    ? schedules.filter((s: any) => s.agent_name === agentId)
    : [];

  function getEdit(s: any) {
    return edits[s.id] ?? { cron: s.cron_expression, enabled: s.enabled, maxCost: s.max_daily_cost ?? '' };
  }

  async function save(s: any) {
    setSaving(s.id);
    const e = getEdit(s);
    try {
      await fetch(`${API_BASE}/api/agents/schedules/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cron_expression: e.cron, enabled: e.enabled, max_daily_cost: e.maxCost ? parseFloat(e.maxCost) : null }),
      });
      refresh();
    } finally { setSaving(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-bold text-white">Schedule Editor — {agentId}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded"><X size={14} /></button>
        </div>
        <div className="p-4 space-y-3">
          {agentSchedules.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-4">No schedules configured</p>
          ) : agentSchedules.map((s: any) => {
            const e = getEdit(s);
            return (
              <div key={s.id} className="bg-gray-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">{s.job_type}</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setEdits(p => ({ ...p, [s.id]: { ...e, enabled: !e.enabled } }))}
                      className={`w-7 h-3.5 rounded-full transition-colors ${e.enabled ? 'bg-green-500' : 'bg-gray-600'} relative`}
                    >
                      <div className={`w-2.5 h-2.5 bg-white rounded-full absolute top-0.5 transition-transform ${e.enabled ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-[10px] text-gray-500">{e.enabled ? 'On' : 'Off'}</span>
                  </label>
                </div>
                <input
                  value={e.cron}
                  onChange={ev => setEdits(p => ({ ...p, [s.id]: { ...e, cron: ev.target.value } }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="cron expression"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number" value={e.maxCost} placeholder="Max cost/day ($)"
                    onChange={ev => setEdits(p => ({ ...p, [s.id]: { ...e, maxCost: ev.target.value } }))}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => save(s)}
                    disabled={saving === s.id}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs text-white font-medium transition-colors disabled:opacity-50"
                  >
                    {saving === s.id ? '...' : 'Save'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Run Inspector Modal ───────────────────────────────────────────────────────
function RunInspector({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data: run, loading } = useAPI<any>(`/api/agent-runs/${runId}/detail`, { interval: 0 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-bold text-white">Run Inspector</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><RefreshCw size={18} className="animate-spin text-blue-400" /></div>
          ) : !run ? (
            <p className="text-gray-500 text-sm text-center py-4">Run not found</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Agent</p><p className="text-white">{run.agent}</p></div>
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Job Type</p><p className="text-white">{run.job_type}</p></div>
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Status</p><p className={run.status === 'success' ? 'text-green-400' : 'text-red-400'}>{run.status}</p></div>
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Duration</p><p className="text-white">{run.duration_ms}ms</p></div>
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Tokens</p><p className="text-white">{run.tokens_used?.toLocaleString()}</p></div>
                <div className="bg-gray-800 rounded-lg p-3"><p className="text-gray-500 mb-1">Cost</p><p className="text-orange-400">${Number(run.cost_usd || 0).toFixed(4)}</p></div>
              </div>
              {run.error && <div className="bg-red-900/20 border border-red-800 rounded-lg p-3"><p className="text-xs text-gray-500 mb-1">Error</p><p className="text-red-400 text-xs">{run.error}</p></div>}
              {run.input && <div className="bg-gray-800 rounded-lg p-3"><p className="text-[10px] text-gray-500 mb-1 uppercase">Input</p><pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">{typeof run.input === 'string' ? run.input : JSON.stringify(run.input, null, 2)}</pre></div>}
              {run.output && <div className="bg-gray-800 rounded-lg p-3"><p className="text-[10px] text-gray-500 mb-1 uppercase">Output</p><pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">{typeof run.output === 'string' ? run.output.slice(0, 2000) : JSON.stringify(run.output, null, 2).slice(0, 2000)}</pre></div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const AGENTS = [
  {
    id: 'revenue_orchestrator',
    label: 'Revenue Orchestrator',
    description: 'Brain of the platform — sets goals, kills/scales, dispatches all other agents',
    color: 'border-purple-500/30 bg-purple-900/10',
    icon: '🧠',
    jobs: [
      { type: 'weekly_review',  label: 'Run Weekly Review' },
      { type: 'daily_dispatch', label: 'Run Daily Dispatch' },
    ],
  },
  {
    id: 'seo_demand_capture',
    label: 'SEO Demand Capture',
    description: 'BOFU keyword research, landing page generation, technical SEO audits',
    color: 'border-blue-500/30 bg-blue-900/10',
    icon: '🔍',
    jobs: [
      { type: 'keyword_discovery', label: 'Discover Keywords' },
      { type: 'technical_audit',   label: 'Run Technical Audit' },
    ],
  },
  {
    id: 'authority_content',
    label: 'Authority Content',
    description: 'Case studies, LinkedIn strategy, email nurture sequences',
    color: 'border-yellow-500/30 bg-yellow-900/10',
    icon: '✍️',
    jobs: [
      { type: 'linkedin_strategy', label: 'Generate LinkedIn Strategy' },
      { type: 'nurture_sequence',  label: 'Create Nurture Sequence' },
    ],
  },
  {
    id: 'social_distribution',
    label: 'Social Distribution',
    description: 'Repurpose content, detect intent signals, A/B test post variants',
    color: 'border-pink-500/30 bg-pink-900/10',
    icon: '📣',
    jobs: [
      { type: 'analyze_engagement', label: 'Analyze Engagement' },
    ],
  },
  {
    id: 'inbound_conversion',
    label: 'Inbound Conversion',
    description: 'Lead scoring, personalized follow-ups, landing page CRO',
    color: 'border-green-500/30 bg-green-900/10',
    icon: '🎯',
    jobs: [
      { type: 'follow_up_queue', label: 'Process Follow-up Queue' },
    ],
  },
  {
    id: 'revenue_analytics',
    label: 'Revenue Analytics',
    description: 'Multi-touch attribution, kill/scale decisions, paid unlock checks',
    color: 'border-orange-500/30 bg-orange-900/10',
    icon: '📊',
    jobs: [
      { type: 'weekly_intelligence', label: 'Generate Intelligence Report' },
    ],
  },
  {
    id: 'compounding_growth',
    label: 'Compounding Growth',
    description: 'Pattern extraction, playbook creation, winner scaling',
    color: 'border-cyan-500/30 bg-cyan-900/10',
    icon: '🚀',
    jobs: [
      { type: 'extract_patterns', label: 'Extract Growth Patterns' },
      { type: '90_day_roadmap',   label: 'Generate 90-Day Roadmap' },
    ],
  },
];

export default function AgentsPage() {
  const { data: runs } = useAPI('/api/agent-runs', { interval: 5_000 });
  const { data: costs } = useAPI('/api/cost/summary', { interval: 60_000 });
  const [triggering, setTriggering]       = useState<string | null>(null);
  const [messages, setMessages]           = useState<Record<string, string>>({});
  const [scheduleAgent, setScheduleAgent] = useState<string | null>(null);
  const [inspectRunId, setInspectRunId]   = useState<string | null>(null);

  async function handleTrigger(agentId: string, jobType: string) {
    const key = `${agentId}:${jobType}`;
    setTriggering(key);
    try {
      const result = await triggerAgent(agentId, jobType, {});
      setMessages(m => ({ ...m, [key]: `Queued: Job ${result.jobId}` }));
    } catch (err: any) {
      setMessages(m => ({ ...m, [key]: `Error: ${err.message}` }));
    } finally {
      setTriggering(null);
      setTimeout(() => setMessages(m => { const n = {...m}; delete n[key]; return n; }), 4000);
    }
  }

  const getAgentRuns = (agentId: string) =>
    Array.isArray(runs)
      ? (runs as any[]).filter((r: any) => r.agent === agentId).slice(0, 5)
      : [];

  const getAgentCost = (agentId: string) =>
    Array.isArray(costs)
      ? (costs as any[]).find((c: any) => c.agent === agentId)
      : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Activity size={20} className="text-green-400" /> Agent Control Panel
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">All 7 agents running autonomously — manual trigger available</p>
      </div>

      {scheduleAgent && <ScheduleModal agentId={scheduleAgent} onClose={() => setScheduleAgent(null)} />}
      {inspectRunId  && <RunInspector runId={inspectRunId}    onClose={() => setInspectRunId(null)} />}

      <div className="space-y-4">
        {AGENTS.map(agent => {
          const recentRuns = getAgentRuns(agent.id);
          const cost       = getAgentCost(agent.id);
          const lastRun    = recentRuns[0];

          return (
            <div key={agent.id} className={`border rounded-xl p-5 ${agent.color}`}>
              <div className="flex items-start gap-4">
                {/* Icon + name */}
                <div className="text-2xl mt-0.5">{agent.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-white">{agent.label}</h3>
                    <button
                      onClick={() => setScheduleAgent(agent.id)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      title="Edit schedules"
                    >
                      <Calendar size={10} /> Schedule
                    </button>
                    {lastRun && (
                      <StatusChip status={lastRun.status} />
                    )}
                    {cost && (
                      <span className="text-xs text-orange-400 flex items-center gap-1">
                        <DollarSign size={10} />${Number(cost.total_cost_usd || 0).toFixed(3)} (30d)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{agent.description}</p>

                  {/* Recent runs timeline */}
                  {recentRuns.length > 0 && (
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {recentRuns.map((run: any, i: number) => (
                        <button
                          key={i}
                          onClick={() => setInspectRunId(run.id)}
                          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 px-2 py-1 rounded-lg transition-colors"
                        >
                          <StatusIcon status={run.status} />
                          <span className="text-gray-600">{run.job_type}</span>
                          {run.duration_ms && <span className="text-gray-700">{run.duration_ms}ms</span>}
                          <Eye size={10} className="text-gray-700" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Last run time */}
                  {lastRun?.started_at && (
                    <div className="mt-1.5 text-[10px] text-gray-600 flex items-center gap-1">
                      <Clock size={10} />
                      Last run: {new Date(lastRun.started_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Trigger buttons */}
                <div className="flex flex-col gap-2 shrink-0">
                  {agent.jobs.map(job => {
                    const key = `${agent.id}:${job.type}`;
                    return (
                      <div key={job.type}>
                        <button
                          onClick={() => handleTrigger(agent.id, job.type)}
                          disabled={triggering === key}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs text-gray-300 transition-colors whitespace-nowrap"
                        >
                          {triggering === key
                            ? <RefreshCw size={11} className="animate-spin" />
                            : <Zap size={11} />
                          }
                          {job.label}
                        </button>
                        {messages[key] && (
                          <div className="text-[10px] text-green-400 mt-0.5 pl-1">{messages[key]}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    success: 'bg-green-900/40 text-green-400',
    failed:  'bg-red-900/40 text-red-400',
    running: 'bg-blue-900/40 text-blue-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cfg[status] || 'bg-gray-800 text-gray-500'}`}>
      {status}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle size={11} className="text-green-400" />;
  if (status === 'failed')  return <AlertCircle size={11} className="text-red-400" />;
  return <RefreshCw size={11} className="text-blue-400 animate-spin" />;
}
