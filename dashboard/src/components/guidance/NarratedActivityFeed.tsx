'use client';
import { CheckCircle, AlertCircle, Clock, RefreshCw, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// ── Agent color map (mirrors overview/page.tsx) ─────────────────────────────
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
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
  const color = AGENT_COLORS[name] || 'text-gray-400 bg-gray-800';
  return <span className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${color}`}>{label}</span>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle size={14} className="text-green-400 shrink-0" />;
  if (status === 'failed')  return <AlertCircle size={14} className="text-red-400 shrink-0" />;
  if (status === 'running') return <RefreshCw size={14} className="text-blue-400 animate-spin shrink-0" />;
  return <Clock size={14} className="text-gray-500 shrink-0" />;
}

// ── Narration map ────────────────────────────────────────────────────────────
interface Narration {
  headline: string;
  impact: string;
  actionLabel?: string;
  actionHref?: string;
}

const NARRATIONS: Record<string, Narration> = {
  'seo_demand_capture:keyword_discovery': {
    headline: 'Found new keywords your buyers are searching for',
    impact: 'Check Keywords — BOFU keywords are ready for page generation',
    actionLabel: 'View keywords',
    actionHref: '/keywords',
  },
  'seo_demand_capture:generate_page': {
    headline: 'Published a new SEO landing page',
    impact: 'This page is live and will start ranking over the next 2-8 weeks',
    actionLabel: 'View content',
    actionHref: '/content',
  },
  'seo_demand_capture:technical_audit': {
    headline: 'Ran a technical SEO audit on your pages',
    impact: 'Any issues found are logged in Notifications',
    actionLabel: 'View notifications',
    actionHref: '/notifications',
  },
  'seo_demand_capture:monitor_competitors': {
    headline: 'Checked competitor keyword rankings',
    impact: 'Gaps where you can outrank competitors have been flagged',
    actionLabel: 'View keywords',
    actionHref: '/keywords',
  },
  'authority_content:linkedin_strategy': {
    headline: 'Generated your LinkedIn content plan for this week',
    impact: '5 posts are ready for review — approve them to schedule publishing',
    actionLabel: 'Review content',
    actionHref: '/content',
  },
  'authority_content:generate_nurture_sequence': {
    headline: 'Built a 7-email nurture sequence',
    impact: 'New leads now receive automated follow-ups until they\'re ready to buy',
    actionLabel: 'View content',
    actionHref: '/content',
  },
  'authority_content:generate_case_study': {
    headline: 'Wrote a new case study',
    impact: 'Case studies convert 3-5x better than landing pages for bottom-funnel leads',
    actionLabel: 'Review content',
    actionHref: '/content',
  },
  'authority_content:decay_remediation': {
    headline: 'Refreshed content that was losing Google rankings',
    impact: 'Updated pages typically recover positions within 2-4 weeks',
    actionLabel: 'View content',
    actionHref: '/content',
  },
  'social_distribution:repurpose_content': {
    headline: 'Turned published content into social posts',
    impact: 'New LinkedIn posts are scheduled — review before they go live',
    actionLabel: 'View posts',
    actionHref: '/social',
  },
  'social_distribution:analyze_engagement': {
    headline: 'Analyzed social media for buyer signals',
    impact: 'Anyone who engaged with your posts has been flagged as a potential lead',
    actionLabel: 'View leads',
    actionHref: '/leads',
  },
  'social_distribution:ab_variant_generation': {
    headline: 'Created A/B variants for your social posts',
    impact: 'Different hooks and CTAs will be tested to find the best-performing version',
  },
  'inbound_conversion:process_lead': {
    headline: 'Scored a new incoming lead',
    impact: 'Lead quality assessed — hot leads (80+) have been flagged for immediate follow-up',
    actionLabel: 'View leads',
    actionHref: '/leads',
  },
  'inbound_conversion:follow_up_queue': {
    headline: 'Processed the lead follow-up queue',
    impact: 'Leads that haven\'t responded get moved automatically to the next nurture step',
    actionLabel: 'View leads',
    actionHref: '/leads',
  },
  'inbound_conversion:optimize_landing_page': {
    headline: 'Started a new A/B test on a landing page',
    impact: 'Two variants are running — winner auto-declared at 90% confidence',
    actionLabel: 'View experiments',
    actionHref: '/experiments',
  },
  'inbound_conversion:recalibrate_scoring': {
    headline: 'Re-calibrated lead scoring based on recent wins',
    impact: 'Lead scores now reflect what your actual customers look like',
    actionLabel: 'View leads',
    actionHref: '/leads',
  },
  'revenue_analytics:weekly_intelligence': {
    headline: 'Generated your weekly revenue intelligence report',
    impact: 'Check Revenue for attribution breakdown — see which channels are making money',
    actionLabel: 'View revenue',
    actionHref: '/revenue',
  },
  'revenue_analytics:attribute_revenue': {
    headline: 'Traced revenue back to its sources',
    impact: 'Every closed deal is now linked to the keyword, page, and email that created it',
    actionLabel: 'View attribution',
    actionHref: '/revenue',
  },
  'revenue_orchestrator:daily_dispatch': {
    headline: 'Daily review done — agents have their marching orders',
    impact: 'Underperformers flagged, top performers queued for scaling today',
  },
  'revenue_orchestrator:weekly_review': {
    headline: 'Weekly strategic review complete',
    impact: 'Kill/scale decisions made based on what drove revenue this week',
    actionLabel: 'View revenue',
    actionHref: '/revenue',
  },
  'compounding_growth:extract_patterns': {
    headline: 'Extracted growth patterns from your top performers',
    impact: 'New playbooks created — each one can be applied to 10x more content angles',
    actionLabel: 'View playbooks',
    actionHref: '/playbooks',
  },
  'compounding_growth:scale_winner': {
    headline: 'Scaled a winning pattern to new angles',
    impact: 'What worked once is now running at 10x the original scope',
    actionLabel: 'View content',
    actionHref: '/content',
  },
  'compounding_growth:generate_roadmap': {
    headline: 'Generated your 90-day growth roadmap',
    impact: 'Strategic priorities and milestones are ready to review',
    actionLabel: 'View playbooks',
    actionHref: '/playbooks',
  },
};

function getNarration(agent: string, jobType: string): Narration | null {
  return NARRATIONS[`${agent}:${jobType}`] || null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface NarratedActivityFeedProps {
  runs: any[] | null;
}

export function NarratedActivityFeed({ runs }: NarratedActivityFeedProps) {
  const runsArray = Array.isArray(runs) ? runs.slice(0, 12) : [];

  // Determine if we should show "While you were away" header
  const showAwayHeader = runsArray.length > 0 && runsArray[0]?.started_at
    ? Date.now() - new Date(runsArray[0].started_at).getTime() > 5 * 60_000
    : false;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400">Agent Activity</h3>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-[10px] text-green-500">Live</span>
        </div>
      </div>

      {/* Away header */}
      {showAwayHeader && (
        <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-3">
          While you were away
        </div>
      )}

      {/* Run items */}
      <div className="space-y-0 max-h-[260px] overflow-y-auto">
        {runsArray.map((run: any, i: number) => {
          const narration = getNarration(run.agent, run.job_type);
          return (
            <div key={i} className="flex items-start gap-3 py-2.5 border-b border-gray-800/40 last:border-0">
              <div className="mt-0.5">
                <StatusIcon status={run.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <AgentBadge name={run.agent} />
                </div>
                {narration ? (
                  <>
                    <p className="text-xs text-gray-200 leading-snug">{narration.headline}</p>
                    {run.status !== 'failed' && (
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{narration.impact}</p>
                    )}
                    {run.status === 'failed' && (
                      <p className="text-[11px] text-red-400 mt-0.5">Run failed — check Notifications for details</p>
                    )}
                    {narration.actionLabel && narration.actionHref && run.status === 'success' && (
                      <Link href={narration.actionHref} className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 mt-1 transition-colors">
                        {narration.actionLabel}
                        <ArrowRight size={10} />
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">{run.job_type?.replace(/_/g, ' ')}</p>
                )}
              </div>
              <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
                {run.started_at ? timeAgo(run.started_at) : ''}
              </span>
            </div>
          );
        })}
        {runsArray.length === 0 && (
          <div className="text-center py-10">
            <div className="text-gray-600 text-xs">Agents are warming up...</div>
            <div className="text-gray-700 text-[11px] mt-1">Activity will appear here as agents run</div>
          </div>
        )}
      </div>
    </div>
  );
}
