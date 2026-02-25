'use client';
import { useRouter } from 'next/navigation';
import { ArrowRight, HelpCircle } from 'lucide-react';
import { triggerAgent } from '@/hooks/useAPI';
import { useState } from 'react';

// ── Blurred preview component ────────────────────────────────────────────────

function BlurredRow({ cols }: { cols: string[] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800/40 last:border-0">
      <div className="flex-1 h-2.5 bg-gray-700 rounded-full blur-sm opacity-30" />
      {cols.map((col, i) => (
        <span key={i} className="text-xs font-mono blur-[2px] opacity-25 shrink-0 select-none">{col}</span>
      ))}
    </div>
  );
}

function BlurredTable({ rows }: { rows: Array<string[]> }) {
  return (
    <div className="w-full rounded-lg border border-gray-700/20 mb-5 overflow-hidden">
      {/* Fake header */}
      <div className="flex gap-3 px-4 py-2 bg-gray-800/30">
        <div className="flex-1 h-2 bg-gray-700/50 rounded blur-sm" />
        <div className="w-12 h-2 bg-gray-700/50 rounded blur-sm" />
        <div className="w-12 h-2 bg-gray-700/50 rounded blur-sm" />
        <div className="w-16 h-2 bg-gray-700/50 rounded blur-sm" />
      </div>
      {rows.map((row, i) => <BlurredRow key={i} cols={row} />)}
    </div>
  );
}

// ── Config per page ──────────────────────────────────────────────────────────

type PageKey = 'keywords' | 'content' | 'leads' | 'experiments' | 'social' | 'playbooks';

interface EmptyConfig {
  previewRows: Array<string[]>;
  headline: string;
  body: string;
  meta: string;
  proofText: string;
  ctaLabel: string;
  ctaType: 'navigate' | 'trigger';
  ctaDest?: string;
  ctaAgent?: string;
  ctaJob?: string;
}

const CONFIGS: Record<PageKey, EmptyConfig> = {
  keywords: {
    previewRows: [
      ['#1', '1,200/mo', '$4.20', '$0'],
      ['#3', '890/mo', '$6.80', '$0'],
      ['#8', '2,100/mo', '$3.10', '$0'],
      ['#12', '650/mo', '$9.40', '$0'],
      ['#24', '420/mo', '$5.60', '$0'],
    ],
    headline: 'You\'re missing leads right now',
    body: 'People are searching for alternatives to your competitors, your product category, and the exact problems you solve — right now, today. You\'re not ranking for any of these. Your competitors are capturing those leads instead.',
    meta: '~60 seconds to run · ~$0.06 AI cost',
    proofText: 'Typically uncovers 20-50 buying-intent keywords on the first run',
    ctaLabel: 'Run Keyword Discovery',
    ctaType: 'navigate',
    ctaDest: '/keywords',
  },
  content: {
    previewRows: [
      ['blog_post', '1,240 views', '8 leads', '$340'],
      ['landing_page', '890 views', '12 leads', '$680'],
      ['case_study', '320 views', '5 leads', '$1,200'],
      ['landing_page', '670 views', '4 leads', '$190'],
    ],
    headline: 'No content = no organic leads',
    body: 'Every day without published content is another day competitors capture the leads that should be yours. The Authority Content agent writes conversion-optimized pages in your brand voice — you just review and publish.',
    meta: '~3-5 minutes per page · ~$0.08 AI cost',
    proofText: 'Each published page is a 24/7 lead-capturing asset that compounds over time',
    ctaLabel: 'Generate First Content',
    ctaType: 'navigate',
    ctaDest: '/agents',
  },
  leads: {
    previewRows: [
      ['Sarah Chen', 'Acme Corp', '87/100', 'SQL'],
      ['Mark Davis', 'Techflow', '74/100', 'MQL'],
      ['Lisa Park', 'GrowthCo', '91/100', 'SQL'],
      ['James Wu', 'Startify', '62/100', 'Prospect'],
    ],
    headline: 'Your pipeline is empty — let\'s fill it',
    body: 'Leads come from two sources: organic content that ranks on Google, and social posts that attract buyers. Both are automated. You need at least one integration connected and one piece of content published to start the flow.',
    meta: 'Setup time: ~5 minutes for integrations',
    proofText: 'Each lead gets scored 0-100 in seconds — hot leads trigger instant Slack/SMS alerts',
    ctaLabel: 'Connect Your First Channel',
    ctaType: 'navigate',
    ctaDest: '/settings/integrations',
  },
  experiments: {
    previewRows: [
      ['Variant A', '2.1% CVR', '847 visitors', '18 conv.'],
      ['Variant B', '3.4% CVR', '851 visitors', '29 conv.'],
      ['Confidence', '91.2%', 'Winner: B', '+62% lift'],
    ],
    headline: 'Experiments unlock compounding growth',
    body: 'Every landing page has a winning headline, CTA, and layout that converts better than all the others. The Inbound Conversion agent automatically creates and runs A/B tests. When a winner is found at 90%+ confidence, it scales automatically.',
    meta: 'Experiments start automatically once you have traffic',
    proofText: 'Teams running continuous A/B tests see 20-40% CVR improvements over 90 days',
    ctaLabel: 'Trigger Conversion Optimization',
    ctaType: 'trigger',
    ctaAgent: 'inbound_conversion',
    ctaJob: 'optimize_landing_page',
  },
  social: {
    previewRows: [
      ['LinkedIn', 'Published', '1,240 impressions', '34 likes'],
      ['LinkedIn', 'Scheduled', 'Tomorrow 9am', '—'],
      ['LinkedIn', 'Draft', 'Pending review', '—'],
      ['LinkedIn', 'Published', '890 impressions', '21 likes'],
    ],
    headline: 'Your content isn\'t reaching buyers yet',
    body: 'Every published SEO page and case study can become a LinkedIn post, Twitter thread, and engagement magnet. The Social Distribution agent repurposes content automatically and publishes on your behalf. Interested buyers in the comments become leads.',
    meta: 'Requires at least one published content piece',
    proofText: 'Social distribution multiplies each piece of content into 3-5 platform-native posts',
    ctaLabel: 'Generate Social Content',
    ctaType: 'trigger',
    ctaAgent: 'social_distribution',
    ctaJob: 'repurpose_content',
  },
  playbooks: {
    previewRows: [
      ['BOFU keyword cluster', 'SEO', '5x applied', '12% CVR'],
      ['LinkedIn hook format', 'Social', '8x applied', '3.2x eng.'],
      ['Email subject pattern', 'Email', '4x applied', '42% open'],
      ['Case study structure', 'Content', '3x applied', '5.1x leads'],
    ],
    headline: 'No growth patterns extracted yet',
    body: 'The Compounding Growth agent identifies what\'s working across your keywords, content, emails, and posts — then turns those patterns into reusable playbooks. Once you have published content and leads, patterns start emerging automatically.',
    meta: 'Patterns extracted every Thursday at 2pm automatically',
    proofText: 'Each playbook can be applied to 10x more angles — turning one winner into a growth engine',
    ctaLabel: 'Extract Patterns Now',
    ctaType: 'trigger',
    ctaAgent: 'compounding_growth',
    ctaJob: 'extract_patterns',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface SmartEmptyStateProps {
  page: PageKey;
  onPrimaryAction?: () => void;
  className?: string;
}

export function SmartEmptyState({ page, onPrimaryAction, className = '' }: SmartEmptyStateProps) {
  const router = useRouter();
  const config = CONFIGS[page];
  const [triggering, setTriggering] = useState(false);
  const [done, setDone] = useState(false);

  if (!config) return null;

  async function handleCTA() {
    if (onPrimaryAction) {
      onPrimaryAction();
      return;
    }
    if (config.ctaType === 'navigate' && config.ctaDest) {
      router.push(config.ctaDest);
      return;
    }
    if (config.ctaType === 'trigger' && config.ctaAgent && config.ctaJob) {
      setTriggering(true);
      try {
        await triggerAgent(config.ctaAgent, config.ctaJob, {});
        setDone(true);
      } catch {
        // ignore
      } finally {
        setTriggering(false);
      }
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center py-10 px-6 text-center ${className}`}>
      {/* Blurred preview */}
      <div className="w-full max-w-lg mb-6">
        <div className="text-[10px] text-gray-700 uppercase tracking-wider font-semibold mb-2 text-left">Preview — what this looks like with data</div>
        <BlurredTable rows={config.previewRows} />
      </div>

      {/* Headline */}
      <h3 className="text-base font-bold text-white mb-2">{config.headline}</h3>

      {/* Body */}
      <p className="text-sm text-gray-400 leading-relaxed max-w-md mb-4">{config.body}</p>

      {/* Meta */}
      <div className="flex items-center gap-4 text-[11px] text-gray-600 mb-5">
        <span>{config.meta}</span>
      </div>

      {/* Social proof */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-6 bg-gray-800/40 rounded-full px-3 py-1.5">
        <HelpCircle size={10} className="text-gray-600" />
        {config.proofText}
      </div>

      {/* CTA */}
      {done ? (
        <div className="text-sm text-green-400">Queued! Check Agent Activity for progress.</div>
      ) : (
        <button
          onClick={handleCTA}
          disabled={triggering}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-blue-900/30"
        >
          {triggering ? 'Queuing...' : config.ctaLabel}
          {!triggering && <ArrowRight size={14} />}
        </button>
      )}
    </div>
  );
}
