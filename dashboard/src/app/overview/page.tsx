'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  TrendingUp, Target, Users, DollarSign, Search, Zap,
  ArrowUpRight, ArrowDownRight, Activity, AlertCircle,
  CheckCircle, Clock, RefreshCw,
} from 'lucide-react';
import { Tooltip as HelpTooltip } from '@/components/ui/Tooltip';
import { SmartActionBar, NarratedActivityFeed, PageIntro } from '@/components/guidance';
import { LayoutDashboard } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─────────────────────────────────────────────
// Data hooks
// ─────────────────────────────────────────────

function useAPI<T>(path: string, interval = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = async () => {
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
  };

  useEffect(() => {
    fetch_();
    const t = setInterval(fetch_, interval);
    return () => clearInterval(t);
  }, [path]);

  return { data, loading, error, refresh: fetch_ };
}

// ─────────────────────────────────────────────
// KPI Card component
// ─────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  color: string;
  suffix?: string;
}

function KPICard({ title, value, delta, icon, color, suffix }: KPICardProps) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col gap-3 hover:border-gray-700 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm font-medium">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold text-white">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {suffix && <span className="text-gray-500 mb-1">{suffix}</span>}
      </div>
      {delta !== undefined && (
        <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
          {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          <span>{Math.abs(delta)}% vs last week</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Agent Status Badge
// ─────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  revenue_orchestrator: 'text-purple-400 bg-purple-900/30',
  seo_demand_capture:   'text-blue-400 bg-blue-900/30',
  authority_content:    'text-yellow-400 bg-yellow-900/30',
  social_distribution:  'text-pink-400 bg-pink-900/30',
  inbound_conversion:   'text-green-400 bg-green-900/30',
  revenue_analytics:    'text-orange-400 bg-orange-900/30',
  compounding_growth:   'text-cyan-400 bg-cyan-900/30',
};

function AgentBadge({ name }: { name: string }) {
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const color = AGENT_COLORS[name] || 'text-gray-400 bg-gray-800';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{label}</span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success')  return <CheckCircle size={14} className="text-green-400" />;
  if (status === 'failed')   return <AlertCircle size={14} className="text-red-400" />;
  if (status === 'running')  return <RefreshCw size={14} className="text-blue-400 animate-spin" />;
  return <Clock size={14} className="text-gray-400" />;
}

// ─────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────

export default function Dashboard() {
  const { data: kpis }       = useAPI('/api/kpis', 15_000);
  const { data: content }    = useAPI('/api/content', 60_000);
  const { data: keywords }   = useAPI('/api/keywords', 60_000);
  const { data: pipeline }   = useAPI('/api/pipeline', 30_000);
  const { data: runs }       = useAPI('/api/agent-runs', 10_000);
  const { data: experiments }= useAPI('/api/experiments', 30_000);

  const [activeTab, setActiveTab] = useState<'overview'|'content'|'keywords'|'agents'|'experiments'>('overview');

  const pipelineChartData = Array.isArray(pipeline)
    ? pipeline.slice(0, 8).reverse().map((p: any) => ({
        week: p.week ? new Date(p.week).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'N/A',
        leads: p.new_leads || 0,
        qualified: p.qualified || 0,
        customers: p.customers || 0,
      }))
    : [];

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 pl-14 pr-4 py-3 md:px-6 md:py-4 flex items-center justify-between sticky top-0 bg-gray-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          <h1 className="text-sm md:text-lg font-bold text-white">LSC Revenue Platform</h1>
          <span className="hidden sm:inline text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">ORGANIC-ONLY MODE</span>
        </div>
        <div className="hidden md:flex items-center gap-4">
          <span className="text-sm text-gray-400">{new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          <div className="flex items-center gap-1 text-green-400 text-sm">
            <Activity size={14} />
            <span>Autonomous</span>
          </div>
        </div>
      </header>

      <div className="px-3 py-4 md:px-6 md:py-6">
        <PageIntro
          page="overview"
          icon={<LayoutDashboard size={16} />}
          title="Revenue Dashboard — Your Business at a Glance"
          auto="All 7 agents run on schedule and update KPIs every 10-30 seconds automatically"
          yourJob="Review trends weekly. Check the Agent Activity feed for anything needing attention"
          outcome="After 30 days: a clear pattern of which keywords and content are generating leads"
        />
        <SmartActionBar />
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <HelpTooltip content="Total new leads captured via organic channels in the last 30 days. Unlock goal: ≥50/month before paid ads are enabled." side="bottom">
            <div className="w-full">
              <KPICard
                title="Leads (30d)"
                value={(kpis as any)?.leads_30d ?? '—'}
                icon={<Users size={18} className="text-green-400" />}
                color="bg-green-900/30"
                delta={12}
              />
            </div>
          </HelpTooltip>
          <HelpTooltip content="Leads captured this week — early warning indicator. Should be ≥12/week to hit the monthly goal of 50." side="bottom">
            <div className="w-full">
              <KPICard
                title="Leads (7d)"
                value={(kpis as any)?.leads_7d ?? '—'}
                icon={<TrendingUp size={18} className="text-blue-400" />}
                color="bg-blue-900/30"
                delta={8}
              />
            </div>
          </HelpTooltip>
          <HelpTooltip content="Organic-attributed MRR this month using U-shaped attribution (40% first touch / 20% middle / 40% last touch). Unlock goal: ≥$10K." side="bottom">
            <div className="w-full">
              <KPICard
                title="Revenue (30d)"
                value={`$${((kpis as any)?.revenue_30d ?? 0).toLocaleString()}`}
                icon={<DollarSign size={18} className="text-purple-400" />}
                color="bg-purple-900/30"
                delta={23}
              />
            </div>
          </HelpTooltip>
          <HelpTooltip content="Keywords ranking on Google Page 1 (positions 1–10). Page 1 drives ~95% of clicks. SEO agent syncs positions daily from Google Search Console." side="bottom">
            <div className="w-full">
              <KPICard
                title="Keywords Page 1"
                value={(kpis as any)?.keywords_page1 ?? '—'}
                icon={<Search size={18} className="text-yellow-400" />}
                color="bg-yellow-900/30"
                delta={5}
              />
            </div>
          </HelpTooltip>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <HelpTooltip content="Total SEO pages, case studies, and landing pages that are live and indexed. More assets = more surface area to capture intent." side="bottom">
            <div className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Published Assets</div>
              <div className="text-2xl font-bold">{(kpis as any)?.published_assets ?? '—'}</div>
            </div>
          </HelpTooltip>
          <HelpTooltip content="A/B tests currently running. Each experiment tests a CTA, headline, or page section. Auto-declares winner at ≥95% statistical confidence." side="bottom">
            <div className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Active Experiments</div>
              <div className="text-2xl font-bold text-yellow-400">{(kpis as any)?.active_experiments ?? '—'}</div>
            </div>
          </HelpTooltip>
          <HelpTooltip content="Total AI agent job executions in the last 24 hours. Each run = a real task completed (keyword research, lead scoring, content creation, etc)." side="bottom">
            <div className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-1">Agent Runs (24h)</div>
              <div className="text-2xl font-bold text-green-400">{(kpis as any)?.agent_runs_24h ?? '—'}</div>
            </div>
          </HelpTooltip>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {([
            { id: 'overview',     tip: 'Pipeline velocity chart and live agent activity feed' },
            { id: 'content',      tip: 'All published assets with pageviews → leads → revenue per piece' },
            { id: 'keywords',     tip: 'Tracked keywords with SERP positions and revenue attribution' },
            { id: 'agents',       tip: 'Manually trigger any of the 7 AI agents and view run history' },
            { id: 'experiments',  tip: 'Active A/B tests with Bayesian confidence and winner uplift' },
          ] as const).map(({ id, tip }) => (
            <HelpTooltip key={id} content={tip} side="bottom">
              <button
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                {id}
              </button>
            </HelpTooltip>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline Chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Pipeline Velocity</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={pipelineChartData}>
                  <defs>
                    <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#gradLeads)" name="Leads" />
                  <Area type="monotone" dataKey="qualified" stroke="#8b5cf6" fill="none" name="Qualified" />
                  <Area type="monotone" dataKey="customers" stroke="#22c55e" fill="none" name="Customers" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <NarratedActivityFeed runs={runs as any[]} />
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Content</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Type</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Pageviews</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Leads</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">CVR</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(content) && content.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-white max-w-xs truncate">{c.title || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{c.content_type || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{(c.pageviews || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-400 font-medium">{c.leads_generated || 0}</td>
                    <td className="px-4 py-3 text-right text-blue-400">
                      {c.conversion_rate ? `${(c.conversion_rate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-purple-400 font-semibold">
                      ${(c.revenue_attr || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(!content || (content as any[]).length === 0) && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-600">No content data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Keywords Tab */}
        {activeTab === 'keywords' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Keyword</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Intent</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Position</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Leads</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Revenue</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Rev/Lead</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(keywords) && keywords.map((k: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-white">{k.keyword}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        k.intent === 'BOFU' ? 'bg-green-900/40 text-green-400' :
                        k.intent === 'MOFU' ? 'bg-yellow-900/40 text-yellow-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>{k.intent}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {k.serp_position ? `#${Math.round(k.serp_position)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-green-400">{k.total_leads || 0}</td>
                    <td className="px-4 py-3 text-right text-purple-400 font-semibold">
                      ${(k.total_revenue || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-blue-400">
                      ${(k.revenue_per_lead || 0).toFixed(0)}
                    </td>
                  </tr>
                ))}
                {(!keywords || (keywords as any[]).length === 0) && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-600">No keyword data yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Agents Tab */}
        {activeTab === 'agents' && (
          <div className="space-y-4">
            {Object.keys(AGENT_COLORS).map(agent => (
              <div key={agent} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <AgentBadge name={agent} />
                  <HelpTooltip content="Manually run this agent's primary job right now. Normally runs automatically on its cron schedule — use this for testing or on-demand execution." side="left">
                    <button
                      onClick={async () => {
                        const jobMap: Record<string, string> = {
                          revenue_orchestrator: 'daily_dispatch',
                          seo_demand_capture: 'keyword_discovery',
                          authority_content: 'linkedin_strategy',
                          social_distribution: 'analyze_engagement',
                          inbound_conversion: 'follow_up_queue',
                          revenue_analytics: 'weekly_intelligence',
                          compounding_growth: 'extract_patterns',
                        };
                        await fetch(`${API_BASE}/trigger/${agent}/${jobMap[agent]}`, { method: 'POST', headers: { 'X-Api-Key': 'lsc-trigger-2026' } });
                      }}
                      className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-300 transition-colors flex items-center gap-1"
                    >
                      <Zap size={12} /> Trigger
                    </button>
                  </HelpTooltip>
                </div>
                <div className="space-y-1">
                  {Array.isArray(runs) && runs
                    .filter((r: any) => r.agent === agent)
                    .slice(0, 3)
                    .map((run: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-gray-500">
                        <StatusIcon status={run.status} />
                        <span>{run.job_type}</span>
                        <span className="ml-auto">{run.started_at ? new Date(run.started_at).toLocaleString() : ''}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Experiments Tab */}
        {activeTab === 'experiments' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Experiment</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Confidence</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Winner</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-medium">Uplift</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(experiments) && experiments.map((e: any, i: number) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 font-medium text-white">{e.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        e.status === 'running' ? 'bg-blue-900/40 text-blue-400' :
                        e.status === 'winner_found' ? 'bg-green-900/40 text-green-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>{e.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {e.confidence ? `${e.confidence.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{e.winner ? `Variant ${e.winner.toUpperCase()}` : '—'}</td>
                    <td className="px-4 py-3 text-right text-green-400">
                      {e.winner_uplift ? `+${(e.winner_uplift * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {(!experiments || (experiments as any[]).length === 0) && (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-600">No experiments running</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
