'use client';

import { useState } from 'react';
import { useAPI, apiPost } from '@/hooks/useAPI';
import { PageIntro } from '@/components/guidance';
import {
  Globe, Plus, RefreshCw, Trash2, ChevronDown, ChevronUp,
  TrendingUp, Users, FileText, Search, DollarSign,
  CheckCircle, AlertCircle, Clock, ExternalLink, RotateCcw,
  Cpu, Target, Zap,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    active:    { icon: <CheckCircle size={11} />, cls: 'text-green-400 bg-green-900/30 border-green-800',   label: 'Active' },
    analyzing: { icon: <RefreshCw size={11} className="animate-spin" />, cls: 'text-blue-400 bg-blue-900/30 border-blue-800', label: 'Analyzing…' },
    failed:    { icon: <AlertCircle size={11} />, cls: 'text-red-400 bg-red-900/30 border-red-800',         label: 'Failed' },
    pending:   { icon: <Clock size={11} />,       cls: 'text-gray-400 bg-gray-800 border-gray-700',          label: 'Pending' },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.cls}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ─── Pill list ───────────────────────────────────────────────────────────────

function PillList({ items, color = 'bg-gray-800 text-gray-300' }: { items: string[]; color?: string }) {
  if (!items?.length) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full ${color}`}>{item}</span>
      ))}
    </div>
  );
}

// ─── Stat tile ───────────────────────────────────────────────────────────────

function StatTile({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${color}`}>{icon}<span className="text-[10px] text-gray-500">{label}</span></div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ─── Agent trigger buttons with proper feedback ──────────────────────────────

const AGENT_JOBS = [
  { label: 'Discover Keywords', agent: 'seo_demand_capture', job: 'keyword_discovery', color: 'text-blue-400'   },
  { label: 'Generate Content',  agent: 'authority_content',  job: 'linkedin_strategy', color: 'text-yellow-400' },
  { label: 'Analyse Revenue',   agent: 'revenue_analytics',  job: 'weekly_intelligence', color: 'text-purple-400' },
] as const;

type BtnState = 'idle' | 'loading' | 'done' | 'error';

function AgentTriggers({ product }: { product: any }) {
  const [states,   setStates]   = useState<Record<string, BtnState>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function trigger(agent: string, job: string) {
    const key = `${agent}:${job}`;
    setStates(s => ({ ...s, [key]: 'loading' }));
    setMessages(m => ({ ...m, [key]: '' }));
    try {
      const res = await fetch(`${API_BASE}/trigger/${agent}/${job}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'lsc-trigger-2026' },
        body: JSON.stringify({
          productId: product.id,
          productContext: {
            name:             product.name,
            icp:              product.icp,
            valueProposition: product.value_proposition,
            competitors:      product.competitors,
            websiteUrl:       product.website_url,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStates(s   => ({ ...s,   [key]: 'done' }));
      setMessages(m => ({ ...m,   [key]: `Queued — Job #${data.jobId}` }));
    } catch (err: any) {
      setStates(s   => ({ ...s,   [key]: 'error' }));
      setMessages(m => ({ ...m,   [key]: err.message }));
    } finally {
      // Reset to idle after 5 seconds
      setTimeout(() => setStates(s => ({ ...s, [key]: 'idle' })), 5000);
    }
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 font-medium">
        Run agents for this product
      </div>
      <div className="flex flex-wrap gap-2">
        {AGENT_JOBS.map(({ label, agent, job, color }) => {
          const key   = `${agent}:${job}`;
          const state = states[key] || 'idle';
          const msg   = messages[key];

          return (
            <div key={key} className="flex flex-col gap-1">
              <button
                onClick={() => trigger(agent, job)}
                disabled={state === 'loading'}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                  state === 'done'
                    ? 'bg-green-900/30 border-green-800 text-green-400'
                    : state === 'error'
                    ? 'bg-red-900/30 border-red-800 text-red-400'
                    : state === 'loading'
                    ? 'bg-gray-800 border-gray-700 text-gray-400 cursor-wait'
                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
                }`}
              >
                {state === 'loading' && <RefreshCw size={11} className="animate-spin" />}
                {state === 'done'    && <CheckCircle size={11} />}
                {state === 'error'   && <AlertCircle size={11} />}
                {state === 'idle'    && <Zap size={11} className={color} />}
                {state === 'loading' ? 'Queuing…' : label}
              </button>
              {msg && (
                <span className={`text-[10px] pl-1 ${state === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                  {msg}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Expanded product detail ─────────────────────────────────────────────────

function ProductDetail({ product, onReanalyze, onDelete }: {
  product: any;
  onReanalyze: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile icon={<Search size={12} />}     label="Keywords"  value={product.keyword_count || 0}    color="text-blue-400" />
        <StatTile icon={<FileText size={12} />}   label="Content"   value={product.content_count || 0}    color="text-yellow-400" />
        <StatTile icon={<Users size={12} />}      label="Leads"     value={product.lead_count || 0}       color="text-green-400" />
        <StatTile icon={<DollarSign size={12} />} label="Revenue"   value={`$${Number(product.revenue_usd || 0).toLocaleString()}`} color="text-purple-400" />
      </div>

      {/* Profile fields */}
      {product.status === 'active' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {product.description && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Description</div>
                <p className="text-xs text-gray-300 leading-relaxed">{product.description}</p>
              </div>
            )}
            {product.icp && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Ideal Customer Profile</div>
                <p className="text-xs text-gray-300 leading-relaxed">{product.icp}</p>
              </div>
            )}
            {product.value_proposition && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Value Proposition</div>
                <p className="text-xs text-gray-300 leading-relaxed">{product.value_proposition}</p>
              </div>
            )}
            {product.pricing_model && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Pricing</div>
                <span className="text-xs text-gray-400 capitalize">{product.pricing_model}</span>
                {product.target_market && (
                  <span className="text-xs text-gray-600 ml-2">· {product.target_market}</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {product.features?.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Key Features</div>
                <PillList items={product.features} color="bg-blue-900/30 text-blue-300" />
              </div>
            )}
            {product.competitors?.length > 0 && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Competitors</div>
                <PillList items={product.competitors} color="bg-red-900/20 text-red-300" />
              </div>
            )}
            {product.brand_tone && (
              <div>
                <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Brand Tone</div>
                <span className="text-xs text-gray-400 capitalize">{product.brand_tone}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent actions — always visible once a product exists */}
      <AgentTriggers product={product} />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onReanalyze}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
        >
          <RotateCcw size={11} /> Re-analyze
        </button>
        <a
          href={product.website_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
        >
          <ExternalLink size={11} /> Open site
        </a>
        <button
          onClick={onDelete}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:text-red-400 hover:bg-red-900/20 transition-colors ml-auto"
        >
          <Trash2 size={11} /> Remove
        </button>
      </div>
    </div>
  );
}

// ─── Product card ────────────────────────────────────────────────────────────

function ProductCard({ product, onRefresh }: { product: any; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);

  async function handleReanalyze() {
    await fetch(`${API_BASE}/api/products/${product.id}/reanalyze`, { method: 'POST' });
    onRefresh();
  }

  async function handleDelete() {
    const kwCount  = product.keyword_count  || 0;
    const caCount  = product.content_count  || 0;
    const ldCount  = product.lead_count     || 0;
    const hasRev   = Number(product.revenue_usd || 0) > 0;
    const details  = [
      kwCount ? `${kwCount} keyword${kwCount !== 1 ? 's' : ''}` : null,
      caCount ? `${caCount} content asset${caCount !== 1 ? 's' : ''}` : null,
      ldCount ? `${ldCount} lead${ldCount !== 1 ? 's' : ''}` : null,
      hasRev  ? 'all associated revenue events' : null,
    ].filter(Boolean);
    const suffix = details.length
      ? ` This will also permanently delete ${details.join(' and ')}.`
      : '';
    if (!confirm(`Remove "${product.name}"?${suffix}`)) return;
    await fetch(`${API_BASE}/api/products/${product.id}`, { method: 'DELETE' });
    onRefresh();
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start gap-4">
        {/* Domain favicon */}
        <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          <img
            src={`https://www.google.com/s2/favicons?domain=${product.website_url}&sz=32`}
            alt=""
            className="w-6 h-6"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-white">{product.name}</h3>
            <StatusBadge status={product.status} />
            {product.pricing_model && product.pricing_model !== 'unknown' && (
              <span className="text-[10px] text-gray-500 capitalize">{product.pricing_model}</span>
            )}
            {product.target_market && (
              <span className="text-[10px] text-gray-600">{product.target_market}</span>
            )}
          </div>

          {product.tagline && (
            <p className="text-xs text-gray-400 mt-0.5 italic">&ldquo;{product.tagline}&rdquo;</p>
          )}

          <a
            href={product.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-gray-600 hover:text-blue-400 transition-colors flex items-center gap-1 mt-1"
          >
            <Globe size={10} /> {product.website_url}
          </a>

          {/* Quick stats inline */}
          {product.status === 'active' && (
            <div className="flex items-center gap-4 mt-2">
              {[
                { label: 'keywords', value: product.keyword_count || 0, color: 'text-blue-400' },
                { label: 'content',  value: product.content_count || 0,  color: 'text-yellow-400' },
                { label: 'leads',    value: product.lead_count || 0,     color: 'text-green-400' },
                { label: 'revenue',  value: `$${Number(product.revenue_usd || 0).toLocaleString()}`, color: 'text-purple-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1">
                  <span className={`text-sm font-semibold ${s.color}`}>{s.value}</span>
                  <span className="text-[10px] text-gray-600">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {product.status === 'analyzing' && (
            <p className="text-xs text-blue-400 mt-2 flex items-center gap-1.5">
              <RefreshCw size={11} className="animate-spin" />
              Fetching and analyzing website with GPT-4o-mini…
            </p>
          )}

          {product.status === 'failed' && (
            <p className="text-xs text-red-400 mt-2">
              Analysis failed — site may be blocking bots or returned an error.
              <button onClick={handleReanalyze} className="ml-2 underline hover:text-red-300">Retry</button>
            </p>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(o => !o)}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <ProductDetail
          product={product}
          onReanalyze={handleReanalyze}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ─── Add product form ────────────────────────────────────────────────────────

function AddProductForm({ onAdded }: { onAdded: () => void }) {
  const [url,     setUrl]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await apiPost('/api/products', { website_url: url.trim() });
      setUrl('');
      onAdded();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-gray-900 border border-blue-900/40 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Globe size={15} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Add a product or service to market</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Paste the website URL. GPT-4o-mini will visit the page and extract the product name, ICP,
        value proposition, features, competitors and brand tone — automatically configuring all agents for it.
      </p>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://yourproduct.com  or  yourproduct.com"
            className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-8 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors whitespace-nowrap"
        >
          {loading
            ? <><RefreshCw size={13} className="animate-spin" /> Analyzing…</>
            : <><Plus size={13} /> Analyze & Add</>
          }
        </button>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={11} /> {error}
        </p>
      )}

      {/* What gets extracted */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { icon: <Target size={11} />,  label: 'ICP + Value Prop',   desc: 'Who it\'s for & why they buy' },
          { icon: <Cpu size={11} />,     label: 'Features + Tone',    desc: 'What it does & how to talk about it' },
          { icon: <TrendingUp size={11}/>,label: 'Competitors',       desc: 'Who to position against' },
        ].map(item => (
          <div key={item.label} className="flex items-start gap-2 p-2 bg-gray-950 rounded-lg">
            <div className="text-blue-400 mt-0.5 shrink-0">{item.icon}</div>
            <div>
              <div className="text-[10px] text-gray-300 font-medium">{item.label}</div>
              <div className="text-[10px] text-gray-600">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </form>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const { data: products, loading, refresh } = useAPI<any[]>('/api/products', { interval: 8_000 });

  // Auto-refresh while any product is being analyzed
  const hasAnalyzing = Array.isArray(products) && products.some(p => p.status === 'analyzing');

  return (
    <div className="p-6 max-w-4xl">
      <PageIntro
        page="products"
        icon={<Globe size={16} className="text-blue-400" />}
        title="Products — What You're Marketing"
        auto="AI reads your website and automatically extracts your ICP, value proposition, competitors, pricing model, and brand tone"
        yourJob="Paste your product URL and let the AI analyze it. Review and confirm the extracted profile looks accurate"
        outcome="Once configured, every agent decision — keywords, emails, LinkedIn posts — is tailored to your exact buyer persona"
      />
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Globe size={20} className="text-blue-400" />
          Products & Services
        </h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Add any website — the AI reads it, extracts the product profile, and all agents automatically
          adapt their keyword research, content and lead scoring to that product.
        </p>
      </div>

      {/* Add form */}
      <div className="mb-6">
        <AddProductForm onAdded={refresh} />
      </div>


      {/* Product list */}
      {loading && (
        <div className="text-center py-12 text-gray-500 text-sm">
          <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
          Loading…
        </div>
      )}

      {!loading && (!products || products.length === 0) && (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <Globe size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">No products added yet</p>
          <p className="text-gray-600 text-xs mt-1">Add your first product URL above to get started.</p>
        </div>
      )}

      <div className="space-y-3">
        {Array.isArray(products) && products.map(product => (
          <ProductCard key={product.id} product={product} onRefresh={refresh} />
        ))}
      </div>

      {hasAnalyzing && (
        <p className="text-xs text-gray-600 text-center mt-4">
          Page auto-refreshes every 8 seconds while analysis is in progress.
        </p>
      )}
    </div>
  );
}
