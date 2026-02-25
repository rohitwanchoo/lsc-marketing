'use client';

import { useState, useEffect, useRef } from 'react';
import { useAPI, apiPost } from '@/hooks/useAPI';
import {
  Search, Zap, Plus, X, ChevronRight, Globe,
  TrendingUp, CheckCircle, AlertCircle, RefreshCw,
  ArrowUpRight, ArrowDownRight, BarChart2, Target, Trash2,
  FileText, Link, Download, Layers,
} from 'lucide-react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

// ─── Pill tag input ─────────────────────────────────────────────────────────

function TagInput({
  label, placeholder, tags, onChange,
}: {
  label: string;
  placeholder: string;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function add(raw: string) {
    const newTags = raw.split(',').map(t => t.trim()).filter(t => t && !tags.includes(t));
    if (newTags.length) onChange([...tags, ...newTags]);
    setDraft('');
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    if (e.key === 'Backspace' && draft === '' && tags.length) onChange(tags.slice(0, -1));
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5 font-medium">{label}</label>
      <div
        className="flex flex-wrap gap-1.5 p-2.5 bg-gray-900 border border-gray-700 rounded-lg min-h-[44px] cursor-text focus-within:border-blue-500 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 bg-blue-900/40 text-blue-300 text-xs px-2 py-0.5 rounded-full">
            {t}
            <button onClick={() => onChange(tags.filter(x => x !== t))} className="hover:text-white">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => draft && add(draft)}
          placeholder={tags.length === 0 ? placeholder : 'Add more…'}
          className="bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none flex-1 min-w-[160px]"
        />
      </div>
      <p className="text-[10px] text-gray-600 mt-1">Press Enter or comma to add. Backspace to remove last.</p>
    </div>
  );
}

// ─── Job status poller ───────────────────────────────────────────────────────

type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

function useJobStatus(jobId: string | null): JobStatus {
  const [status, setStatus] = useState<JobStatus>('idle');

  useEffect(() => {
    if (!jobId) { setStatus('idle'); return; }
    setStatus('queued');

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/agent-runs/seo_demand_capture`);
        const runs = await res.json();
        const run = runs.find((r: any) => String(r.id) === String(jobId));
        if (!run) return; // not in DB yet
        if (run.status === 'success') setStatus('done');
        else if (run.status === 'failed') setStatus('failed');
        else setStatus('running');
      } catch {}
    };

    const timer = setInterval(poll, 2000);
    return () => clearInterval(timer);
  }, [jobId]);

  return status;
}

// ─── Keyword table ───────────────────────────────────────────────────────────

function IntentBadge({ intent }: { intent: string }) {
  const cfg: Record<string, string> = {
    BOFU: 'bg-green-900/40 text-green-400 border-green-800',
    MOFU: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
    TOFU: 'bg-gray-800 text-gray-400 border-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${cfg[intent] || cfg.TOFU}`}>
      {intent}
    </span>
  );
}

function DifficultyBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct < 35 ? 'bg-green-500' : pct < 65 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-6">{pct}</span>
    </div>
  );
}

// ─── Sparkline mini chart ─────────────────────────────────────────────────────

function SerpSparkline({ keywordId }: { keywordId: string }) {
  const { data } = useAPI<any[]>(`/api/keywords/${keywordId}/serp-history`, { interval: 0 });
  if (!data || data.length < 2) return <span className="text-gray-600 text-xs">—</span>;
  // Lower position = better, so invert for chart (position 1 = top)
  const chartData = data.map((d: any) => ({ date: d.date, pos: d.position }));
  return (
    <ResponsiveContainer width={60} height={24}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="pos" stroke="#60a5fa" dot={false} strokeWidth={1.5} />
        <Tooltip
          contentStyle={{ background: '#111', border: '1px solid #374151', fontSize: 10 }}
          formatter={(v: any) => [`#${Math.round(v)}`, 'pos']}
          labelFormatter={(l: string) => l}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Content Brief Modal ─────────────────────────────────────────────────────

function BriefModal({ keyword, keywordId, onClose }: { keyword: string; keywordId: string; onClose: () => void }) {
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

  useEffect(() => {
    fetch(`${apiBase}/api/keywords/${keywordId}/brief`)
      .then(r => r.json())
      .then(d => setBrief(d))
      .catch(() => setBrief({ error: 'Failed to generate brief' }))
      .finally(() => setLoading(false));
  }, [keywordId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-white">Content Brief</h2>
            <p className="text-xs text-gray-500 mt-0.5">{keyword}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw size={20} className="animate-spin text-blue-400" /></div>
          ) : brief?.error ? (
            <p className="text-red-400 text-sm">{brief.error}</p>
          ) : brief?.raw ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap">{brief.raw}</pre>
          ) : brief && (
            <div className="space-y-3">
              {brief.title && <div><p className="text-[10px] text-gray-500 uppercase mb-1">Title</p><p className="text-white text-sm">{brief.title}</p></div>}
              {brief.meta_description && <div><p className="text-[10px] text-gray-500 uppercase mb-1">Meta Description</p><p className="text-gray-300 text-xs">{brief.meta_description}</p></div>}
              {brief.h1 && <div><p className="text-[10px] text-gray-500 uppercase mb-1">H1</p><p className="text-white text-sm font-medium">{brief.h1}</p></div>}
              {Array.isArray(brief.outline) && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase mb-2">Outline</p>
                  <div className="space-y-1">
                    {brief.outline.map((s: any, i: number) => (
                      <div key={i} className="px-3 py-1.5 bg-gray-800 rounded-lg">
                        <p className="text-xs font-medium text-gray-300">{s.heading}</p>
                        {s.notes && <p className="text-[11px] text-gray-500 mt-0.5">{s.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {brief.cta && <div><p className="text-[10px] text-gray-500 uppercase mb-1">CTA</p><p className="text-blue-400 text-xs">{brief.cta}</p></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Internal Links Modal ────────────────────────────────────────────────────

function InternalLinksModal({ keyword, keywordId, onClose }: { keyword: string; keywordId: string; onClose: () => void }) {
  const { data: links, loading } = useAPI<any[]>(`/api/keywords/${keywordId}/internal-links`, { interval: 0 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-white">Internal Link Opportunities</h2>
            <p className="text-xs text-gray-500 mt-0.5">{keyword}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-gray-800"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw size={20} className="animate-spin text-blue-400" /></div>
          ) : !links?.length ? (
            <div className="text-center py-8 text-gray-600 text-sm">No related content found</div>
          ) : (
            links.map((c: any) => (
              <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30">
                <FileText size={13} className="text-gray-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-white">{c.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{c.content_type?.replace(/_/g, ' ')} · {c.status}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function KeywordsPage() {
  const { data: keywords, refresh } = useAPI<any[]>('/api/keywords', { interval: 0 });
  const { data: clusters }          = useAPI<any[]>('/api/keywords/clusters', { interval: 0 });

  const [seedKeywords,   setSeedKeywords]   = useState<string[]>([]);
  const [competitors,    setCompetitors]    = useState<string[]>([]);
  const [jobId,          setJobId]          = useState<string | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [panelOpen,      setPanelOpen]      = useState(false);
  const [bulkOpen,       setBulkOpen]       = useState(false);
  const [filter,         setFilter]         = useState<'ALL' | 'BOFU' | 'MOFU' | 'TOFU'>('ALL');
  const [activeProduct,  setActiveProduct]  = useState<string | null>(null);
  const [selectedKws,        setSelectedKws]        = useState<Set<string>>(new Set());
  const [bulkJobId,          setBulkJobId]          = useState<string | null>(null);
  const [bulkError,          setBulkError]          = useState<string | null>(null);
  const [removingUnassigned, setRemovingUnassigned] = useState(false);
  const [activeTab,          setActiveTab]          = useState<'list' | 'clusters'>('list');
  const [briefKw,            setBriefKw]            = useState<{ id: string; keyword: string } | null>(null);
  const [linksKw,            setLinksKw]            = useState<{ id: string; keyword: string } | null>(null);

  const jobStatus     = useJobStatus(jobId);
  const bulkJobStatus = useJobStatus(bulkJobId);

  // Refresh keyword table when either job finishes
  useEffect(() => {
    if (jobStatus === 'done' || bulkJobStatus === 'done') {
      setTimeout(refresh, 1000);
    }
  }, [jobStatus, bulkJobStatus]);

  async function runBulkGenerate() {
    if (!selectedKws.size) return;
    setBulkError(null);
    try {
      const keywordCluster = [...selectedKws].map(kw => {
        const k = (keywords ?? []).find((x: any) => x.keyword === kw);
        return {
          keyword:         kw,
          keywordId:       k?.id       || null,
          pageType:        k?.intent === 'BOFU' ? 'landing_page' : k?.intent === 'MOFU' ? 'comparison' : 'use_case',
          conversionAngle: 'Free trial — no credit card required',
        };
      });
      const res = await apiPost('/trigger/seo_demand_capture/bulk_generate_pages', {
        keywordCluster,
        batchSize: 3,
      });
      setBulkJobId(String(res.jobId));
      setBulkOpen(false);
      setSelectedKws(new Set());
    } catch (e: any) {
      setBulkError(e.message);
    }
  }

  async function runDiscovery() {
    setError(null);
    try {
      const res = await apiPost('/trigger/seo_demand_capture/keyword_discovery', {
        seedKeywords,
        competitors,
      });
      setJobId(String(res.jobId));
      setPanelOpen(false); // collapse form, show status bar
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeUnassigned() {
    const count = (keywords ?? []).filter((k: any) => !k.product_name).length;
    if (!confirm(`Remove all ${count} unassigned keyword${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setRemovingUnassigned(true);
    try {
      await fetch(`${API_BASE}/api/keywords/unassigned`, { method: 'DELETE' });
      refresh();
    } finally {
      setRemovingUnassigned(false);
    }
  }

  // Group all keywords by product (before intent filter)
  const allGrouped = (keywords ?? []).reduce((acc: Record<string, any[]>, k) => {
    const key = k.product_name || 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(k);
    return acc;
  }, {});

  const productNames = Object.keys(allGrouped);
  const currentProduct = activeProduct && productNames.includes(activeProduct)
    ? activeProduct
    : productNames[0] ?? null;

  const filtered        = (currentProduct ? (allGrouped[currentProduct] ?? []) : [])
    .filter((k: any) => filter === 'ALL' || k.intent === filter);
  const unassignedCount = (allGrouped['Unassigned'] ?? []).length;

  const statusBar = jobId && jobStatus !== 'idle';

  return (
    <div className="flex flex-col h-screen overflow-hidden px-4 md:px-6 py-4 md:py-5 gap-3">

      <PageIntro
        page="keywords"
        icon={<Search size={16} className="text-blue-400" />}
        title="Keywords — Your Demand Capture Map"
        auto="SEO Agent finds buying-intent keywords daily, tracks Google positions via Search Console, and attributes revenue to each keyword"
        yourJob="Review the list, select the best BOFU keywords, click 'Generate Pages' to create landing pages for them"
        outcome="After 60 days: 20-40 keywords on Google page 1, each generating leads without ad spend"
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Search size={18} className="text-blue-400" />
            Discover Intent
          </h1>
          <p className="text-gray-500 text-xs mt-0.5">
            Buying-intent keywords ranked by priority — grouped by product.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab switcher */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-0.5">
            {(['list', 'clusters'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${activeTab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'clusters' ? <span className="flex items-center gap-1"><Layers size={11} />Clusters</span> : 'List'}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.open(`${API_BASE}/api/export/keywords`, '_blank')}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Download size={12} /> Export
          </button>
          {unassignedCount > 0 && (
            <button
              onClick={removeUnassigned}
              disabled={removingUnassigned}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 rounded-lg transition-colors disabled:opacity-50"
            >
              {removingUnassigned ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove {unassignedCount} unassigned
            </button>
          )}
          <button
            onClick={() => { setBulkOpen(o => !o); setPanelOpen(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-medium text-gray-300 transition-colors"
          >
            <BarChart2 size={13} />
            Bulk Generate
          </button>
          <button
            onClick={() => { setPanelOpen(o => !o); setBulkOpen(false); }}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium text-white transition-colors"
          >
            <Zap size={13} />
            Run Discovery
          </button>
        </div>
      </div>

      {/* ── Discovery form panel ──────────────────────────────────────────── */}
      {panelOpen && (
        <div className="shrink-0 bg-gray-900 border border-blue-900/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-blue-400" />
              <h2 className="text-sm font-semibold text-white">Configure Keyword Discovery</h2>
            </div>
            <button onClick={() => setPanelOpen(false)} className="text-gray-600 hover:text-gray-400">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <TagInput
              label="Seed Keywords (optional)"
              placeholder="e.g. marketing automation…"
              tags={seedKeywords}
              onChange={setSeedKeywords}
            />
            <TagInput
              label="Competitors (optional)"
              placeholder="e.g. HubSpot, Marketo…"
              tags={competitors}
              onChange={setCompetitors}
            />
          </div>

          {error && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={runDiscovery}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold text-white transition-colors"
            >
              <Zap size={13} /> Start Discovery
            </button>
            <span className="text-xs text-gray-600">~60–90 seconds · ~$0.06</span>
          </div>
        </div>
      )}

      {/* ── Bulk Generate panel ───────────────────────────────────────────── */}
      {bulkOpen && (
        <div className="shrink-0 bg-gray-900 border border-purple-900/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-purple-400" />
              <h2 className="text-sm font-semibold text-white">Bulk Generate Pages</h2>
              <span className="text-xs text-gray-600">— select keywords to auto-generate landing pages</span>
            </div>
            <button onClick={() => setBulkOpen(false)} className="text-gray-600 hover:text-gray-400">
              <X size={14} />
            </button>
          </div>

          {/* Keyword checkboxes — BOFU first */}
          {currentProduct && (allGrouped[currentProduct] ?? []).length > 0 ? (
            <>
              <div className="max-h-40 overflow-y-auto space-y-1 mb-3 bg-gray-800/40 rounded-lg p-2">
                {(allGrouped[currentProduct] ?? [])
                  .sort((a: any, b: any) => {
                    const order = { BOFU: 0, MOFU: 1, TOFU: 2 };
                    return (order[a.intent as keyof typeof order] ?? 3) - (order[b.intent as keyof typeof order] ?? 3);
                  })
                  .map((k: any) => (
                    <label key={k.keyword} className="flex items-center gap-2.5 px-1 py-1 rounded hover:bg-gray-700/50 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedKws.has(k.keyword)}
                        onChange={e => {
                          const next = new Set(selectedKws);
                          e.target.checked ? next.add(k.keyword) : next.delete(k.keyword);
                          setSelectedKws(next);
                        }}
                        className="w-3.5 h-3.5 rounded accent-purple-500"
                      />
                      <span className="flex-1 text-xs text-gray-300 truncate group-hover:text-white">{k.keyword}</span>
                      <IntentBadge intent={k.intent || 'TOFU'} />
                    </label>
                  ))
                }
              </div>

              <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <button
                  onClick={() => setSelectedKws(new Set((allGrouped[currentProduct] ?? []).map((k: any) => k.keyword)))}
                  className="text-blue-400 hover:text-blue-300"
                >Select all</button>
                <span>·</span>
                <button onClick={() => setSelectedKws(new Set())} className="text-gray-500 hover:text-gray-300">
                  Clear
                </button>
                <span>·</span>
                <span>{selectedKws.size} selected</span>
                {selectedKws.size > 0 && (
                  <span className="text-gray-600">
                    · ~{selectedKws.size * 3} min · ~${(selectedKws.size * 0.15).toFixed(2)} est.
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-xs mb-3">No keywords available. Run discovery first.</p>
          )}

          {bulkError && (
            <div className="mb-3 p-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-400">
              {bulkError}
            </div>
          )}

          <button
            onClick={runBulkGenerate}
            disabled={selectedKws.size === 0}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-semibold text-white transition-colors"
          >
            <BarChart2 size={13} />
            Generate {selectedKws.size > 0 ? `${selectedKws.size} pages` : 'Pages'}
          </button>
        </div>
      )}

      {/* ── Bulk Generate status bar ─────────────────────────────────────── */}
      {bulkJobId && bulkJobStatus !== 'idle' && (
        <div className={`shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs ${
          bulkJobStatus === 'done'   ? 'bg-green-900/20 border-green-800 text-green-400' :
          bulkJobStatus === 'failed' ? 'bg-red-900/20 border-red-800 text-red-400' :
          'bg-purple-900/20 border-purple-900 text-purple-400'
        }`}>
          {bulkJobStatus === 'done'   && <CheckCircle size={13} />}
          {bulkJobStatus === 'failed' && <AlertCircle size={13} />}
          {(bulkJobStatus === 'queued' || bulkJobStatus === 'running') && <RefreshCw size={13} className="animate-spin" />}
          <span>
            {bulkJobStatus === 'queued'  && 'Bulk generate queued — pages will be created in batches…'}
            {bulkJobStatus === 'running' && 'Generating pages — typically 3–5 min per batch…'}
            {bulkJobStatus === 'done'    && 'Bulk generation complete. New content visible on the Content page.'}
            {bulkJobStatus === 'failed'  && 'Bulk generate failed. Check the Agents page for details.'}
          </span>
          {bulkJobStatus === 'done' && (
            <button onClick={() => setBulkJobId(null)} className="ml-auto text-green-600 hover:text-green-400">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      {statusBar && (
        <div className={`shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-lg border text-xs ${
          jobStatus === 'done'   ? 'bg-green-900/20 border-green-800 text-green-400' :
          jobStatus === 'failed' ? 'bg-red-900/20 border-red-800 text-red-400' :
          'bg-blue-900/20 border-blue-900 text-blue-400'
        }`}>
          {jobStatus === 'done'   && <CheckCircle size={13} />}
          {jobStatus === 'failed' && <AlertCircle size={13} />}
          {(jobStatus === 'queued' || jobStatus === 'running') && <RefreshCw size={13} className="animate-spin" />}
          <span>
            {jobStatus === 'queued'  && 'Job queued — worker will pick it up in a moment…'}
            {jobStatus === 'running' && 'Agent is researching keywords — typically 60–90 seconds…'}
            {jobStatus === 'done'    && 'Discovery complete. New keywords added below.'}
            {jobStatus === 'failed'  && 'Discovery failed. Check the Agents page for details.'}
          </span>
          {jobStatus === 'done' && (
            <button onClick={() => setJobId(null)} className="ml-auto text-green-600 hover:text-green-400">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Main card (fills remaining space) ────────────────────────────── */}
      {/* Clusters tab */}
      {activeTab === 'clusters' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!clusters?.length ? (
            <div className="flex items-center justify-center h-32 text-gray-600 text-sm">No clusters yet — run discovery to auto-assign clusters</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(clusters as any[]).map((c: any, i: number) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-white mb-1">{c.cluster_name}</h3>
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-500 mt-2">
                    <span>{c.keyword_count} keywords</span>
                    <span>{Number(c.total_volume || 0).toLocaleString()} vol</span>
                    <span>avg priority: {Math.round(c.avg_priority || 0)}</span>
                    <span>best pos: #{Math.round(c.best_position || 0) || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'list' && (productNames.length === 0 ? (
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl flex flex-col items-center justify-center">
          <SmartEmptyState page="keywords" onPrimaryAction={() => setPanelOpen(true)} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">

          {/* Product tabs */}
          <div className="shrink-0 flex items-center border-b border-gray-800 overflow-x-auto">
            {productNames.map(name => {
              const count = allGrouped[name].length;
              const isActive = name === currentProduct;
              return (
                <button
                  key={name}
                  onClick={() => { setActiveProduct(name); setFilter('ALL'); }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-white bg-gray-800/50'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
                  }`}
                >
                  <Globe size={13} className={isActive ? 'text-blue-400' : 'text-gray-600'} />
                  {name}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-900/50 text-blue-300' : 'bg-gray-800 text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Intent filter row */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/60">
            <div className="flex items-center gap-2">
              {(['ALL', 'BOFU', 'MOFU', 'TOFU'] as const).map(f => {
                const cnt = f === 'ALL'
                  ? (allGrouped[currentProduct!] ?? []).length
                  : (allGrouped[currentProduct!] ?? []).filter((k: any) => k.intent === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-0.5 text-xs font-medium rounded-full border transition-colors ${
                      filter === f
                        ? f === 'BOFU' ? 'bg-green-900/50 border-green-700 text-green-300'
                        : f === 'MOFU' ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
                        : f === 'TOFU' ? 'bg-gray-700 border-gray-600 text-gray-300'
                        : 'bg-blue-900/40 border-blue-700 text-blue-300'
                        : 'bg-transparent border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                    }`}
                  >
                    {f} <span className="opacity-60">({cnt})</span>
                  </button>
                );
              })}
            </div>
            {currentProduct && allGrouped[currentProduct]?.[0]?.product_website && (
              <span className="text-[11px] text-gray-600 font-mono">
                {allGrouped[currentProduct][0].product_website}
              </span>
            )}
          </div>

          {/* Scrollable table body */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              No {filter !== 'ALL' ? filter : ''} keywords for this product yet.
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900 z-10">
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Keyword</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium text-xs">Intent</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Vol / mo</th>
                    <th className="px-4 py-2.5 text-gray-500 font-medium text-xs">Difficulty</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">CPC</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">SERP pos</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Trend</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Leads</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Revenue</th>
                    <th className="text-right px-4 py-2.5 text-gray-500 font-medium text-xs">Score</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((k: any, i: number) => {
                    const onPage1 = k.serp_position && k.serp_position <= 10;
                    return (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors group">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-white group-hover:text-blue-300 transition-colors text-sm">
                            {k.keyword}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <IntentBadge intent={k.intent || 'TOFU'} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums text-xs">
                          {k.search_volume ? Number(k.search_volume).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {k.difficulty != null
                            ? <DifficultyBar value={k.difficulty} />
                            : <span className="text-gray-600 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums text-xs">
                          {k.cpc_usd ? `$${Number(k.cpc_usd).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs">
                          {k.serp_position
                            ? <span className={`tabular-nums font-medium ${onPage1 ? 'text-green-400' : 'text-gray-400'}`}>
                                #{Math.round(k.serp_position)}
                                {onPage1 && <ArrowUpRight size={11} className="inline ml-0.5" />}
                              </span>
                            : <span className="text-gray-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <SerpSparkline keywordId={k.id} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-green-400 tabular-nums text-xs">
                          {k.total_leads || 0}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-purple-400 tabular-nums text-xs">
                          ${Number(k.total_revenue || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-8 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500" style={{ width: `${k.priority_score || 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 tabular-nums w-5">{k.priority_score || 0}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={e => { e.stopPropagation(); setBriefKw({ id: k.id, keyword: k.keyword }); }}
                              className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                              title="Generate Brief"
                            >
                              <FileText size={12} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setLinksKw({ id: k.id, keyword: k.keyword }); }}
                              className="p-1 rounded text-gray-500 hover:text-purple-400 hover:bg-purple-900/20 transition-colors"
                              title="Find Internal Links"
                            >
                              <Link size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Modals */}
      {briefKw && <BriefModal keyword={briefKw.keyword} keywordId={briefKw.id} onClose={() => setBriefKw(null)} />}
      {linksKw && <InternalLinksModal keyword={linksKw.keyword} keywordId={linksKw.id} onClose={() => setLinksKw(null)} />}
    </div>
  );
}
