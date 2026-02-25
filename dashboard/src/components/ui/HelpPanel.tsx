'use client';
import { useState } from 'react';
import { X, HelpCircle, Zap, Search, FileText, Users, BarChart2, TrendingUp, Brain, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Section data ────────────────────────────────────────────────────────────

const AGENTS = [
  {
    key: 'revenue_orchestrator',
    icon: Brain,
    color: 'text-purple-400',
    bg: 'bg-purple-900/20',
    name: 'Revenue Orchestrator',
    schedule: 'Daily 6 AM + Weekly Monday',
    what: 'The master coordinator. Every morning it reads all KPIs, decides which agents to run, and scales what\'s working. Each week it does a full strategic review and can kill underperforming content or keywords.',
    triggers: ['daily_dispatch', 'weekly_review'],
  },
  {
    key: 'seo_demand_capture',
    icon: Search,
    color: 'text-blue-400',
    bg: 'bg-blue-900/20',
    name: 'SEO Demand Capture',
    schedule: 'Wednesdays + audit Tuesdays',
    what: 'Finds the keywords your ICP uses when they\'re ready to buy (BOFU/MOFU), then generates full conversion-optimised landing pages. Syncs with Google Search Console daily to track positions.',
    triggers: ['keyword_discovery', 'generate_page', 'technical_audit'],
  },
  {
    key: 'authority_content',
    icon: FileText,
    color: 'text-yellow-400',
    bg: 'bg-yellow-900/20',
    name: 'Authority Content',
    schedule: 'Tuesdays (LinkedIn), Monthly (case studies)',
    what: 'Creates case studies that convert, writes your weekly LinkedIn content plan with exact post copy, and builds 7-email nurture sequences for each lead segment.',
    triggers: ['linkedin_strategy', 'generate_case_study', 'generate_nurture_sequence'],
  },
  {
    key: 'social_distribution',
    icon: TrendingUp,
    color: 'text-pink-400',
    bg: 'bg-pink-900/20',
    name: 'Social Distribution',
    schedule: 'Every 30 min (publish), Fridays (analysis)',
    what: 'Repurposes long-form content into platform-native posts, publishes on schedule, tracks engagement, and flags anyone who likes/comments as a potential buyer signal.',
    triggers: ['repurpose_content', 'analyze_engagement', 'publish_scheduled'],
  },
  {
    key: 'inbound_conversion',
    icon: Users,
    color: 'text-green-400',
    bg: 'bg-green-900/20',
    name: 'Inbound Conversion',
    schedule: 'Instant on new lead + every 15 min',
    what: 'Within seconds of a new lead arriving, scores them on fit + intent + engagement (0–100). Routes high-scorers to immediate personal follow-up, others to nurture. Runs A/B tests on landing pages.',
    triggers: ['process_lead', 'follow_up_queue', 'optimize_landing_page'],
  },
  {
    key: 'revenue_analytics',
    icon: BarChart2,
    color: 'text-orange-400',
    bg: 'bg-orange-900/20',
    name: 'Revenue Analytics',
    schedule: 'Mondays (full report)',
    what: 'Attributes every dollar of revenue back to the keyword, page, and channel that sourced it (U-shaped: 40% first touch / 20% middle / 40% last touch). Tells you when you\'ve hit the benchmarks to unlock paid ads.',
    triggers: ['weekly_intelligence', 'attribute_revenue'],
  },
  {
    key: 'compounding_growth',
    icon: Zap,
    color: 'text-cyan-400',
    bg: 'bg-cyan-900/20',
    name: 'Compounding Growth',
    schedule: 'Thursdays (patterns), 1st of month (roadmap)',
    what: 'Analyses what\'s working and extracts reusable playbooks. Scales proven content and keyword patterns. Builds your 90-day growth roadmap. The learning engine of the platform.',
    triggers: ['extract_patterns', 'scale_winner', 'generate_roadmap'],
  },
];

const SECTIONS = [
  {
    href: '/',
    label: 'Overview',
    tip: 'Pipeline velocity chart (leads → qualified → customers per week) and live agent activity feed. Refreshes every 10–15 seconds.',
  },
  {
    href: '/leads',
    label: 'Leads',
    tip: 'Every captured lead with their score (0–100), stage (visitor → subscriber → prospect → MQL → SQL → opportunity → customer), and the content that sourced them.',
  },
  {
    href: '/keywords',
    label: 'Keywords',
    tip: 'All targeted keywords with current SERP position (synced from Google Search Console), leads generated, and revenue attributed per keyword.',
  },
  {
    href: '/content',
    label: 'Content',
    tip: 'Published SEO assets with pageviews, leads, conversion rate, and revenue. Sort by revenue to find your top performers — the Orchestrator scales these automatically.',
  },
  {
    href: '/experiments',
    label: 'Experiments',
    tip: 'Active A/B tests with Bayesian confidence levels. A test auto-declares a winner once ≥95% confidence is reached. Uplift = % conversion improvement of winner vs control.',
  },
  {
    href: '/revenue',
    label: 'Revenue',
    tip: 'U-shaped revenue attribution. 40% of credit goes to first-touch (what brought the lead in), 20% to middle touches, 40% to last-touch (what closed them). Paid unlock criteria tracked here.',
  },
  {
    href: '/social',
    label: 'Social',
    tip: 'LinkedIn post schedule, engagement analytics, and buyer signal detection. Anyone who engages with your content gets flagged and scored.',
  },
  {
    href: '/agents',
    label: 'Agents',
    tip: 'Manual trigger panel for all 7 agents. Each agent shows its last 3 runs with status and timestamp. Normally everything runs on cron — use triggers only for testing.',
  },
  {
    href: '/playbooks',
    label: 'Playbooks',
    tip: 'Reusable growth recipes extracted by the Compounding Growth agent from your top performers. Each playbook is a repeatable set of steps that produced results.',
  },
];

const UNLOCK_CRITERIA = [
  { label: '≥ 50 leads / month organic', key: 'leads' },
  { label: '≥ 3% conversion rate on landing pages', key: 'cvr' },
  { label: 'CAC ≤ $500 fully loaded', key: 'cac' },
  { label: '≥ $10,000 organic MRR', key: 'mrr' },
];

// ─── Accordion ───────────────────────────────────────────────────────────────

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'loop' | 'sections' | 'agents' | 'unlock'>('loop');

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-white text-xs font-medium transition-all"
        title="How to use this platform"
      >
        <HelpCircle size={13} />
        How it works
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-[480px] bg-gray-950 border-l border-gray-800 z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h2 className="text-white font-semibold text-base">Platform Guide</h2>
            <p className="text-xs text-gray-500 mt-0.5">How the autonomous revenue engine works</p>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-800 shrink-0">
          {([
            { id: 'loop',     label: 'The Loop' },
            { id: 'sections', label: 'Pages' },
            { id: 'agents',   label: 'Agents' },
            { id: 'unlock',   label: 'Unlock Paid' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                tab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* THE LOOP */}
          {tab === 'loop' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                The platform runs a fully autonomous 8-step revenue loop — no manual work required once configured.
                Every step feeds the next, compounding over time.
              </p>
              {[
                { n: 1, title: 'Discover Intent',    desc: 'SEO agent finds keywords your buyers use when they\'re ready to purchase.', color: 'bg-blue-500' },
                { n: 2, title: 'Create Asset',       desc: 'Authority Content agent writes a conversion-optimised page or case study for that keyword.', color: 'bg-yellow-500' },
                { n: 3, title: 'Publish & Rank',     desc: 'Page goes live. SEO agent monitors SERP position daily via Google Search Console.', color: 'bg-blue-400' },
                { n: 4, title: 'Distribute',         desc: 'Social agent repurposes the content into LinkedIn posts, schedules and publishes them.', color: 'bg-pink-500' },
                { n: 5, title: 'Capture Lead',       desc: 'Visitor fills a form. Inbound agent scores them in <2 seconds and routes to the right sequence.', color: 'bg-green-500' },
                { n: 6, title: 'Nurture & Close',    desc: 'Email sequences run automatically. High-score leads get a personal follow-up trigger.', color: 'bg-green-400' },
                { n: 7, title: 'Attribute Revenue',  desc: 'When a deal closes, Analytics agent distributes credit across every touchpoint (U-shaped model).', color: 'bg-orange-500' },
                { n: 8, title: 'Learn & Scale',      desc: 'Compounding agent extracts what worked into playbooks and scales the winners automatically.', color: 'bg-cyan-500' },
              ].map(step => (
                <div key={step.n} className="flex gap-3">
                  <div className={`${step.color} w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white text-[11px] font-bold mt-0.5`}>
                    {step.n}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{step.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{step.desc}</div>
                  </div>
                </div>
              ))}
              <div className="mt-4 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="text-white font-medium">Organic-only rule:</span> No paid advertising runs until
                  all 4 unlock benchmarks are hit. Check the <span className="text-blue-400">Unlock Paid</span> tab for live progress.
                </p>
              </div>
            </div>
          )}

          {/* SECTIONS */}
          {tab === 'sections' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 mb-3">Click any page in the sidebar. Here's what each one shows.</p>
              {SECTIONS.map(s => (
                <Accordion key={s.href} title={s.label}>
                  <p className="text-xs text-gray-400 leading-relaxed">{s.tip}</p>
                </Accordion>
              ))}
            </div>
          )}

          {/* AGENTS */}
          {tab === 'agents' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 mb-1">7 AI agents run on cron schedules. Each can also be triggered manually from the Agents page.</p>
              {AGENTS.map(a => {
                const Icon = a.icon;
                return (
                  <div key={a.key} className={`${a.bg} border border-gray-800 rounded-lg p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon size={14} className={a.color} />
                      <span className={`text-sm font-medium ${a.color}`}>{a.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed mb-2">{a.what}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-gray-600">Schedule:</span>
                      <span className="text-[10px] text-gray-400">{a.schedule}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <span className="text-[10px] text-gray-600">Job types:</span>
                      {a.triggers.map(t => (
                        <span key={t} className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono">{t}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* UNLOCK */}
          {tab === 'unlock' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                The platform stays in <span className="text-green-400 font-medium">organic-only mode</span> until
                all 4 benchmarks are met. Once cleared, the Revenue Analytics agent automatically recommends
                paid channels to amplify what's already working — never to replace organic.
              </p>

              <div className="space-y-2">
                {UNLOCK_CRITERIA.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-800 rounded-lg">
                    <div className="w-5 h-5 rounded border-2 border-gray-700 shrink-0" />
                    <span className="text-sm text-gray-300">{c.label}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-gray-900 border border-yellow-900/40 rounded-lg">
                <p className="text-xs text-yellow-400 font-medium mb-1">Why organic first?</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Paid traffic amplifies what already converts. If you run paid ads before you know your CVR
                  and best-performing keywords, you're paying to test. Organic traffic finds that for free.
                  Hit the benchmarks, then paid becomes a multiplier, not a gamble.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">How to check progress</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Go to <span className="text-blue-400">Revenue</span> in the sidebar.
                  The Revenue Analytics agent produces a weekly intelligence report every Monday with your
                  current position against each benchmark and explicit next-action recommendations.
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  You can also manually trigger <span className="font-mono text-xs bg-gray-800 px-1 rounded">weekly_intelligence</span> from
                  the <span className="text-blue-400">Agents</span> page at any time.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 shrink-0">
          <p className="text-[10px] text-gray-600">
            Webhook endpoint for CRM/form events: <span className="font-mono text-gray-500">POST /webhook/lead</span>
          </p>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Manual agent trigger: <span className="font-mono text-gray-500">POST /trigger/:agent/:jobType</span>
          </p>
        </div>
      </div>
    </>
  );
}
