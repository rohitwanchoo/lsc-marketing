'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Globe, Plug, Search, FileText, Mail, TrendingUp, RefreshCw,
  ChevronDown, ChevronUp, X, ArrowRight, Lightbulb,
} from 'lucide-react';
import { triggerAgent } from '@/hooks/useAPI';
import { useGuidanceState, type ActionId } from '@/hooks/useGuidanceState';

// ── Action definitions ───────────────────────────────────────────────────────

interface ActionDef {
  id: ActionId;
  icon: React.ReactNode;
  iconBg: string;
  headline: string;
  benefit: string;
  why: string;
  ctaLabel: string;
  ctaAction: (router: any, trigger: typeof triggerAgent) => Promise<void> | void;
}

const ACTIONS: ActionDef[] = [
  {
    id: 'add_product',
    icon: <Globe size={18} />,
    iconBg: 'bg-blue-900/40 text-blue-400',
    headline: 'Tell the platform what you\'re selling',
    benefit: 'Paste your website URL — AI reads your product page and configures all 7 agents with your ICP, competitors, and value proposition in about 90 seconds.',
    why: 'Without a product profile, agents use generic defaults. With it, every keyword discovered, email written, and LinkedIn post created is tailored to your exact buyer. This single step is the highest-leverage 2 minutes you can spend.',
    ctaLabel: 'Add Your Product',
    ctaAction: (router) => router.push('/products'),
  },
  {
    id: 'connect_integration',
    icon: <Plug size={18} />,
    iconBg: 'bg-green-900/40 text-green-400',
    headline: 'Connect at least one lead channel',
    benefit: 'Enable LinkedIn, Email, or Google Search Console so every lead that touches those channels is automatically captured, scored, and entered into your pipeline.',
    why: 'Right now, leads could be arriving via LinkedIn engagement or organic search and disappearing into the void. Each connected integration is a lead-capture net you set once and forget. Missing even one channel means leaving leads on the table.',
    ctaLabel: 'Connect a Channel',
    ctaAction: (router) => router.push('/settings/integrations'),
  },
  {
    id: 'run_keyword_discovery',
    icon: <Search size={18} />,
    iconBg: 'bg-blue-900/40 text-blue-400',
    headline: 'Find the keywords your buyers are already searching',
    benefit: 'The SEO agent will analyze your product and uncover 20-50 buying-intent keywords. Each one is a potential page that ranks on Google and captures leads without any ad spend.',
    why: 'Keywords are the foundation of organic growth. Before any content is created, the system needs to know what words your buyers type when they\'re ready to buy — not just browsing. This discovery run finds "alternative to competitor", "[product] pricing", and "[ICP problem] solution" queries that convert at 5-10x the rate of generic keywords.',
    ctaLabel: 'Run Keyword Discovery',
    ctaAction: (router) => router.push('/keywords'),
  },
  {
    id: 'generate_first_content',
    icon: <FileText size={18} />,
    iconBg: 'bg-yellow-900/40 text-yellow-400',
    headline: 'Generate your first piece of content',
    benefit: 'The Authority Content agent will write a full LinkedIn strategy or SEO landing page in your brand voice. This becomes the seed for all social distribution and email nurture.',
    why: 'Content is the mechanism that converts keyword rankings into leads. No content = no leads, regardless of how many keywords you have. One published piece is enough to start the compounding loop — the system will generate, distribute, and optimize from there.',
    ctaLabel: 'Generate Content',
    ctaAction: (router) => router.push('/agents'),
  },
  {
    id: 'setup_email_nurture',
    icon: <Mail size={18} />,
    iconBg: 'bg-pink-900/40 text-pink-400',
    headline: 'Activate email nurture for cold leads',
    benefit: 'The Authority Content agent will generate a 7-email sequence for your lead segments. Leads that aren\'t ready to buy today get nurtured automatically until they are.',
    why: '80% of leads don\'t convert on first contact. Without email nurture, those leads are permanently lost. With it, every lead gets a personalized sequence addressing their specific objection — whether that\'s price, trust, or timing — until they\'re ready to book a call.',
    ctaLabel: 'Create Nurture Sequence',
    ctaAction: async (_router, trigger) => {
      await trigger('authority_content', 'generate_nurture_sequence', {});
    },
  },
  {
    id: 'scale_experiment_winner',
    icon: <TrendingUp size={18} />,
    iconBg: 'bg-cyan-900/40 text-cyan-400',
    headline: 'Your experiment has a winner — scale it now',
    benefit: 'An A/B test reached 90%+ confidence. The winning variant converts better. Apply it to all related pages to immediately boost your lead capture rate across the board.',
    why: 'A winning experiment sitting unscaled is money left on the table every day. The Compounding Growth agent can apply the winning pattern across all similar pages in one job run — turning a single insight into a sitewide conversion improvement.',
    ctaLabel: 'Scale the Winner',
    ctaAction: async (_router, trigger) => {
      await trigger('compounding_growth', 'scale_winner', {});
    },
  },
  {
    id: 'refresh_decaying_content',
    icon: <RefreshCw size={18} />,
    iconBg: 'bg-orange-900/40 text-orange-400',
    headline: 'Content is losing rankings — refresh it',
    benefit: 'Some of your pages have dropped in Google rankings. Refreshing them with updated content typically recovers positions within 2-4 weeks and restores lost organic traffic.',
    why: 'Content decay is the silent revenue killer. Pages that once ranked on page 1 lose 50-70% of their traffic over 18 months without updates — because Google favors fresh, authoritative content. The Authority Content agent knows exactly which pages need updating and what to add.',
    ctaLabel: 'Refresh Decaying Content',
    ctaAction: (_router) => _router.push('/content'),
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export function SmartActionBar() {
  const router = useRouter();
  const { currentAction, actionDismissed, dismissAction } = useGuidanceState();
  const [expanded, setExpanded] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reset expanded when action changes
  useEffect(() => { setExpanded(false); setSuccessMsg(null); }, [currentAction]);

  if (!currentAction || actionDismissed) return null;

  const action = ACTIONS.find(a => a.id === currentAction);
  if (!action) return null;

  async function handleCTA() {
    if (!action) return;
    setTriggering(true);
    try {
      await action.ctaAction(router, triggerAgent);
      if (currentAction === 'setup_email_nurture' || currentAction === 'scale_experiment_winner') {
        setSuccessMsg('Queued! The agent will complete this in the background.');
        setTimeout(() => setSuccessMsg(null), 5000);
      }
    } catch {
      setSuccessMsg('Failed to queue — please try again.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-blue-900/40 rounded-xl p-4 mb-6 transition-all duration-200">
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb size={12} className="text-blue-400" />
          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Recommended Next Step</span>
        </div>
        <button
          onClick={() => dismissAction(currentAction)}
          className="text-gray-600 hover:text-gray-400 transition-colors"
          title="Dismiss for now"
        >
          <X size={13} />
        </button>
      </div>

      {/* Content row */}
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-xl shrink-0 ${action.iconBg}`}>
          {action.icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white mb-1">{action.headline}</h3>
          <p className="text-xs text-gray-400 leading-relaxed">{action.benefit}</p>

          {/* Expandable "Why this matters" */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 mt-2 transition-colors"
          >
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Why this matters
          </button>
          {expanded && (
            <p className="text-[11px] text-gray-500 leading-relaxed mt-2 pl-3 border-l border-gray-700">
              {action.why}
            </p>
          )}

          {successMsg && (
            <p className="text-[11px] text-green-400 mt-2">{successMsg}</p>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={handleCTA}
          disabled={triggering}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {triggering ? 'Working...' : action.ctaLabel}
          {!triggering && <ArrowRight size={12} />}
        </button>
      </div>
    </div>
  );
}
