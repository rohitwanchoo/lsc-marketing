'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Globe, Linkedin, Mail, Search, ChevronRight, ChevronLeft,
  Check, Sparkles, ArrowRight, Clock, Users, DollarSign, Zap,
} from 'lucide-react';
import { patchIntegration } from '@/hooks/useAPI';
import { useGuidanceState } from '@/hooks/useGuidanceState';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

// ── Step 1: Product URL input ────────────────────────────────────────────────

function Step1({ onProductAdded }: { onProductAdded: (product: any) => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(false);

  async function handleAdd() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ website_url: url.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add product');
      const product = await res.json();
      setAdded(true);
      onProductAdded(product);
    } catch (e: any) {
      setError(e.message || 'Something went wrong — please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Left: form */}
      <div className="flex-1">
        <h2 className="text-xl font-bold text-white mb-2">What are you selling?</h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          Paste your product or company website URL. The AI will read your page and automatically configure all 7 agents with your ICP, competitors, and value proposition.
        </p>
        {added ? (
          <div className="flex items-center gap-3 p-4 bg-green-900/20 border border-green-800/40 rounded-xl">
            <Check size={18} className="text-green-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-green-400">Product added — AI is analyzing your site</div>
              <div className="text-xs text-gray-500 mt-0.5">Click Next to continue while analysis runs in the background</div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus-within:border-blue-600 transition-colors">
                <Globe size={16} className="text-gray-500 shrink-0" />
                <input
                  type="url"
                  placeholder="https://yourproduct.com"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"
                  autoFocus
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={loading || !url.trim()}
                className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap"
              >
                {loading ? 'Analyzing...' : 'Analyze →'}
              </button>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <p className="text-xs text-gray-600">~90 seconds · ~$0.06 AI cost · You can edit results afterward</p>
          </div>
        )}
      </div>
      {/* Right: benefit preview */}
      <div className="md:w-56 space-y-3">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-2">Unlocks after analysis</div>
        {[
          { label: 'ICP Profile', desc: 'Who your ideal buyer is' },
          { label: 'Competitors', desc: 'Who you\'re up against' },
          { label: 'Value Prop', desc: 'Why buyers choose you' },
        ].map(item => (
          <div key={item.label} className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-400">{item.label}</span>
              <div className="h-2 w-16 bg-gray-700/60 rounded blur-sm" />
            </div>
            <div className="h-2 w-full bg-gray-700/40 rounded blur-sm" />
            <div className="text-[10px] text-gray-600 mt-1.5">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Confirm ICP ──────────────────────────────────────────────────────

function Step2({ product }: { product: any }) {
  const icp = product?.icp || 'B2B SaaS companies with 10-200 employees';
  const vp = product?.value_proposition || 'Organic revenue growth without paid advertising';
  const competitors = Array.isArray(product?.competitors) ? product.competitors.slice(0, 4) : [];

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <div className="flex-1">
        <h2 className="text-xl font-bold text-white mb-2">Who are you trying to reach?</h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
          This is the profile the AI extracted from your website. All agents use this to tailor every keyword, email, and LinkedIn post to your exact buyer.
        </p>
        <div className="space-y-3">
          <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4">
            <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2">Your Ideal Customer</div>
            <p className="text-sm text-gray-300 leading-relaxed">{icp}</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4">
            <div className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-2">Your Value Proposition</div>
            <p className="text-sm text-gray-300 leading-relaxed">{vp}</p>
          </div>
          {competitors.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700/40 rounded-xl p-4">
              <div className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wider mb-2">Competitors Tracked</div>
              <div className="flex flex-wrap gap-2">
                {competitors.map((c: string, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-3">You can edit this profile any time on the Products page.</p>
      </div>
      <div className="md:w-56">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mb-3">Why this matters</div>
        <div className="bg-blue-900/10 border border-blue-900/20 rounded-xl p-4">
          <p className="text-xs text-blue-300/70 leading-relaxed">
            The more specific your ICP, the higher your keyword rankings and conversion rates. Agents that know you target "B2B SaaS founders at 10-50 person companies" write radically different content than agents working from generic descriptions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Connect integrations ─────────────────────────────────────────────

const INTEGRATION_OPTIONS = [
  {
    key: 'linkedin',
    icon: <Linkedin size={20} className="text-blue-400" />,
    name: 'LinkedIn',
    tagline: 'Capture buyer signals from post engagement',
    benefit: 'People who like/comment on your posts become leads automatically',
  },
  {
    key: 'sendgrid',
    icon: <Mail size={20} className="text-green-400" />,
    name: 'Email (SendGrid)',
    tagline: 'Nurture sequences that close cold leads on autopilot',
    benefit: '7-email sequences follow up with every lead until they\'re ready to buy',
  },
  {
    key: 'google_search_console',
    icon: <Search size={20} className="text-yellow-400" />,
    name: 'Google Search Console',
    tagline: 'Track every organic visitor and keyword ranking',
    benefit: 'See exactly which keywords drive revenue, updated daily',
  },
];

function Step3() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  async function toggle(key: string) {
    const next = !enabled[key];
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      await patchIntegration(key, { enabled: next });
      setEnabled(prev => ({ ...prev, [key]: next }));
    } catch {
      // ignore — user can set up in Settings later
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2">Where do leads come in?</h2>
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Toggle the channels where your buyers find you. Each connected integration is a lead-capture net — set it once and the platform handles the rest.
      </p>
      <div className="space-y-3">
        {INTEGRATION_OPTIONS.map(opt => {
          const isEnabled = enabled[opt.key];
          const isLoading = loading[opt.key];
          return (
            <div
              key={opt.key}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                isEnabled
                  ? 'bg-blue-900/10 border-blue-800/50'
                  : 'bg-gray-800/30 border-gray-700/40 hover:border-gray-600'
              }`}
              onClick={() => !isLoading && toggle(opt.key)}
            >
              <div className="p-2.5 bg-gray-800 rounded-xl">{opt.icon}</div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">{opt.name}</span>
                  {/* Toggle */}
                  <div className={`relative w-9 h-5 rounded-full transition-colors ${isEnabled ? 'bg-blue-600' : 'bg-gray-600'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{opt.tagline}</p>
                <p className="text-xs text-gray-600 mt-0.5">{opt.benefit}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-600 mt-4">You can configure API keys and webhooks in Settings → Integrations after setup. Enable now to activate the channel.</p>
    </div>
  );
}

// ── Step 4: 7-day campaign preview ───────────────────────────────────────────

const CAMPAIGN_DAYS = [
  { day: 1, agent: 'SEO Agent', color: 'bg-blue-500', action: 'Discovers 20-50 buying-intent keywords for your product' },
  { day: 2, agent: 'Authority Content', color: 'bg-yellow-500', action: 'Plans your first week of LinkedIn content in your brand voice' },
  { day: 3, agent: 'Social Distribution', color: 'bg-pink-500', action: 'Schedules and publishes your first LinkedIn posts' },
  { day: 4, agent: 'SEO Agent', color: 'bg-blue-500', action: 'Generates landing pages for top-priority keywords' },
  { day: 5, agent: 'Inbound Conversion', color: 'bg-green-500', action: 'Scores any new leads and routes them to nurture or sales' },
  { day: 6, agent: 'Revenue Analytics', color: 'bg-orange-500', action: 'Attributes early traffic to keywords and content pieces' },
  { day: 7, agent: 'Compounding Growth', color: 'bg-cyan-500', action: 'Extracts first growth patterns from what performed best' },
];

function Step4() {
  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-2">Your first 7-day campaign</h2>
      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
        Here's exactly what happens automatically once you're live. No action needed — this is all handled by your 7 AI agents running on schedule.
      </p>
      <div className="space-y-2">
        {CAMPAIGN_DAYS.map(item => (
          <div key={item.day} className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-xl border border-gray-700/30">
            <div className="text-[10px] font-bold text-gray-600 w-12 shrink-0">Day {item.day}</div>
            <div className={`w-2 h-2 rounded-full shrink-0 ${item.color}`} />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium text-gray-300">{item.agent} — </span>
              <span className="text-xs text-gray-500">{item.action}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 p-3 bg-blue-900/10 border border-blue-900/20 rounded-xl text-xs text-blue-300/70 leading-relaxed">
        After day 7, agents continue running on their weekly schedules — reviewing performance, scaling winners, and publishing new content every week without any manual work.
      </div>
    </div>
  );
}

// ── Step 5: You're live ──────────────────────────────────────────────────────

function Step5() {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-4">
        <div className="p-4 bg-green-900/20 border border-green-800/30 rounded-2xl">
          <Sparkles size={32} className="text-green-400" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">You're live 🎉</h2>
      <p className="text-sm text-gray-400 mb-8 leading-relaxed max-w-sm mx-auto">
        All 7 agents are now running on schedule. Here's what to expect:
      </p>
      <div className="grid grid-cols-3 gap-4 mb-8 text-left">
        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-blue-400" />
            <span className="text-xs font-semibold text-blue-400">Day 7</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">First content published, keyword tracking begins</p>
        </div>
        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users size={14} className="text-green-400" />
            <span className="text-xs font-semibold text-green-400">Day 30</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">10-50 leads expected from organic channels</p>
        </div>
        <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-purple-400" />
            <span className="text-xs font-semibold text-purple-400">Day 90</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">Organic demand established, revenue attributable</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-xs text-gray-600">
        <Zap size={12} />
        All 7 agents are running autonomously on schedule
      </div>
    </div>
  );
}

// ── Main Wizard ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Your Product' },
  { id: 2, label: 'Your Audience' },
  { id: 3, label: 'Lead Channels' },
  { id: 4, label: 'Your Campaign' },
  { id: 5, label: 'You\'re Live' },
];

export function SetupWizard() {
  const router = useRouter();
  const { wizardCompleted, wizardDismissed, completeWizard, dismissWizard } = useGuidanceState();
  const [step, setStep] = useState(1);
  const [visible, setVisible] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    if (!wizardCompleted && !wizardDismissed) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [wizardCompleted, wizardDismissed]);

  if (wizardCompleted || wizardDismissed) return null;

  function next() { setStep(s => Math.min(s + 1, 5)); }
  function prev() { setStep(s => Math.max(s - 1, 1)); }

  function finish() {
    completeWizard();
    router.push('/overview');
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  const canNext =
    step === 1 ? true : // can always skip step 1 (product is optional)
    step === 2 ? true :
    true;

  return (
    <div
      className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        ref={modalRef}
        className={`bg-gray-900 border border-gray-700/60 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl transition-all duration-300 ${visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        {/* Progress bar */}
        <div className="shrink-0 h-1 bg-gray-800 rounded-t-2xl overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {STEPS.map(s => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  s.id < step ? 'bg-green-600 text-white' :
                  s.id === step ? 'bg-blue-600 text-white' :
                  'bg-gray-800 text-gray-600'
                }`}>
                  {s.id < step ? <Check size={10} /> : s.id}
                </div>
                {s.id < STEPS.length && (
                  <div className={`w-6 h-px ${s.id < step ? 'bg-green-700' : 'bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={dismissWizard}
            className="text-gray-600 hover:text-gray-400 transition-colors"
            title="Skip setup"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 1 && <Step1 onProductAdded={(p) => { setProduct(p); }} />}
          {step === 2 && <Step2 product={product} />}
          {step === 3 && <Step3 />}
          {step === 4 && <Step4 />}
          {step === 5 && <Step5 />}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-800 px-6 py-4 flex items-center justify-between">
          <div>
            {step > 1 && step < 5 && (
              <button
                onClick={prev}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            )}
            {step === 1 && (
              <button
                onClick={dismissWizard}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                I'll do this later
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">Step {step} of {STEPS.length}</span>
            {step < 5 ? (
              <button
                onClick={next}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {step === 4 ? 'Finish Setup' : 'Next'}
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                onClick={finish}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Go to Dashboard
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
