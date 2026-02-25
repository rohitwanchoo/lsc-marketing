'use client';
import { useState } from 'react';
import { useAPI } from '@/hooks/useAPI';
import {
  BookOpen, FileText, Globe, TrendingUp,
  Users, DollarSign, Eye, RefreshCw, X, Linkedin, Copy, Check, Trash2,
  Calendar, ChevronLeft, ChevronRight, Download, Share2, CheckCircle, XCircle,
} from 'lucide-react';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

interface ContentItem {
  id: string;
  product_id: string | null;
  title: string;
  content_type: string;
  slug: string | null;
  pageviews: number;
  leads_generated: number;
  conversion_rate: string;
  revenue_attr: string;
  revenue_per_visitor: string | null;
  status: string;
  approval_status: string;
  published_at: string | null;
  body_markdown: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

type Tab = 'list' | 'calendar' | 'approval';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  blog_post:    <Globe size={13} className="text-blue-400" />,
  landing_page: <TrendingUp size={13} className="text-purple-400" />,
  social_post:  <Linkedin size={13} className="text-sky-400" />,
  case_study:   <FileText size={13} className="text-yellow-400" />,
};

const STATUS_COLORS: Record<string, string> = {
  published: 'text-green-400 bg-green-900/20 border-green-800',
  draft:     'text-gray-400 bg-gray-800 border-gray-700',
  scheduled: 'text-blue-400 bg-blue-900/20 border-blue-800',
};

const APPROVAL_COLORS: Record<string, string> = {
  approved:       'text-green-400 bg-green-900/20 border-green-800',
  pending_review: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  draft:          'text-gray-400 bg-gray-800 border-gray-700',
  published:      'text-blue-400 bg-blue-900/20 border-blue-800',
};

const FILTERS = ['all', 'blog_post', 'landing_page', 'social_post', 'case_study'];

function PostModal({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copyToClipboard() {
    navigator.clipboard.writeText(item.body_markdown || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {TYPE_ICONS[item.content_type] ?? <FileText size={14} className="text-gray-400" />}
            <h2 className="text-sm font-semibold text-white truncate">{item.title}</h2>
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[item.status] ?? STATUS_COLORS.draft}`}>
              {item.status}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {item.body_markdown ? (
            <pre className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap font-sans">
              {item.body_markdown}
            </pre>
          ) : (
            <p className="text-gray-500 text-sm">No content body available.</p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-800 flex items-center gap-6 text-xs text-gray-500">
          <span><Eye size={11} className="inline mr-1" />{item.pageviews.toLocaleString()} views</span>
          <span><Users size={11} className="inline mr-1" />{item.leads_generated} leads</span>
          <span><DollarSign size={11} className="inline mr-0.5" />{parseFloat(item.revenue_attr || '0').toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue</span>
        </div>
      </div>
    </div>
  );
}

function CalendarView({ items }: { items: ContentItem[] }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();

  function prevMonth() {
    const d = new Date(year, mon - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  function nextMonth() {
    const d = new Date(year, mon, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const itemsByDay: Record<number, ContentItem[]> = {};
  items.forEach(item => {
    if (!item.published_at) return;
    const d = new Date(item.published_at);
    if (d.getFullYear() === year && d.getMonth() + 1 === mon) {
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = [];
      itemsByDay[day].push(item);
    }
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthName = new Date(year, mon - 1, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button onClick={prevMonth} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-semibold text-white">{monthName}</span>
        <button onClick={nextMonth} className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-800">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-gray-600 uppercase py-2">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-800/50 last:border-0">
          {week.map((day, di) => (
            <div key={di} className={`min-h-[80px] p-1.5 border-r border-gray-800/50 last:border-0 ${day ? '' : 'bg-gray-950/30'}`}>
              {day && (
                <>
                  <div className="text-xs text-gray-600 mb-1">{day}</div>
                  <div className="space-y-0.5">
                    {(itemsByDay[day] ?? []).map((item, ii) => (
                      <div key={ii} className={`text-[9px] px-1 py-0.5 rounded truncate font-medium ${
                        item.content_type === 'blog_post'    ? 'bg-blue-900/40 text-blue-300' :
                        item.content_type === 'landing_page' ? 'bg-purple-900/40 text-purple-300' :
                        item.content_type === 'social_post'  ? 'bg-sky-900/40 text-sky-300' :
                        'bg-yellow-900/40 text-yellow-300'
                      }`} title={item.title}>
                        {item.title}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ContentPage() {
  const { data: items, loading, refresh } = useAPI<ContentItem[]>('/api/content', { interval: 30_000 });
  const [activeTab,          setActiveTab]          = useState<Tab>('list');
  const [filter,             setFilter]             = useState('all');
  const [viewing,            setViewing]            = useState<ContentItem | null>(null);
  const [removingUnassigned, setRemovingUnassigned] = useState(false);
  const [deletingAll,        setDeletingAll]        = useState(false);
  const [repurposing,        setRepurposing]        = useState<string | null>(null);
  const [approving,          setApproving]          = useState<string | null>(null);
  const [bulkPublishing,     setBulkPublishing]     = useState(false);

  const list = (items ?? []).filter(i => filter === 'all' || i.content_type === filter);
  const pendingApproval = (items ?? []).filter(i => i.approval_status === 'pending_review');
  const unassignedCount = (items ?? []).filter(i => !i.product_id).length;

  async function deleteAll() {
    const count = items?.length ?? 0;
    if (!confirm(`Delete all ${count} content asset${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      await fetch(`${API_BASE}/api/content-assets`, { method: 'DELETE' });
      refresh();
    } finally {
      setDeletingAll(false);
    }
  }

  async function removeUnassigned() {
    if (!confirm(`Remove all ${unassignedCount} unassigned content asset${unassignedCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setRemovingUnassigned(true);
    try {
      await fetch(`${API_BASE}/api/content-assets/unassigned`, { method: 'DELETE' });
      refresh();
    } finally {
      setRemovingUnassigned(false);
    }
  }

  async function repurpose(id: string) {
    setRepurposing(id);
    try {
      await fetch(`${API_BASE}/api/content/${id}/repurpose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: ['linkedin', 'twitter'] }),
      });
    } finally {
      setRepurposing(null);
      refresh();
    }
  }

  async function bulkPublish() {
    setBulkPublishing(true);
    try {
      await fetch(`${API_BASE}/api/content/bulk-publish`, { method: 'POST' });
      refresh();
    } finally {
      setBulkPublishing(false);
    }
  }

  async function setApproval(id: string, status: string) {
    setApproving(id);
    try {
      await fetch(`${API_BASE}/api/content/${id}/approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: status }),
      });
      refresh();
    } finally {
      setApproving(null);
    }
  }

  const published = (items ?? []).filter(i => i.status === 'published');
  const totalLeads = (items ?? []).reduce((s, i) => s + (i.leads_generated || 0), 0);
  const totalRevenue = (items ?? []).reduce((s, i) => s + parseFloat(i.revenue_attr || '0'), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageIntro
        page="content"
        icon={<BookOpen size={16} className="text-yellow-400" />}
        title="Content — Your Lead Generation Assets"
        auto="Authority Content Agent writes pages in your brand voice. Social Distribution repurposes each piece into LinkedIn posts automatically"
        yourJob="Review drafts in the Approval tab, approve for publishing. Use the Calendar view to see what's scheduled"
        outcome="After 30 days: a growing library of SEO assets each generating organic leads on autopilot"
      />

      {viewing && <PostModal item={viewing} onClose={() => setViewing(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-yellow-400" />
            Content Library
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">All content generated by the Authority Content agent</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => window.open(`${API_BASE}/api/export/content`, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-xs transition-colors"
          >
            <Download size={12} /> Export CSV
          </button>
          <button
            onClick={deleteAll}
            disabled={deletingAll || (items?.length ?? 0) === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deletingAll ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete all
          </button>
          <button
            onClick={removeUnassigned}
            disabled={removingUnassigned || unassignedCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {removingUnassigned ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Remove {unassignedCount > 0 ? unassignedCount : ''} unassigned
          </button>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-xs transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total pieces',       value: items?.length ?? 0,    icon: <BookOpen size={16} className="text-yellow-400" />,  color: 'border-yellow-400/20' },
          { label: 'Published',          value: published.length,       icon: <Globe size={16} className="text-green-400" />,      color: 'border-green-400/20'  },
          { label: 'Leads generated',    value: totalLeads,             icon: <Users size={16} className="text-blue-400" />,       color: 'border-blue-400/20'   },
          { label: 'Revenue attributed', value: `$${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: <DollarSign size={16} className="text-purple-400" />, color: 'border-purple-400/20' },
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {([['list', 'List'], ['calendar', 'Calendar'], ['approval', `Approval${pendingApproval.length > 0 ? ` (${pendingApproval.length})` : ''}`]] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${activeTab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            {t === 'calendar' && <Calendar size={11} />}
            {label}
          </button>
        ))}
      </div>

      {/* Calendar tab */}
      {activeTab === 'calendar' && (
        <CalendarView items={items ?? []} />
      )}

      {/* Approval tab */}
      {activeTab === 'approval' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          {pendingApproval.length === 0 ? (
            <div className="text-center py-12 text-gray-600 text-sm">
              <CheckCircle size={28} className="mx-auto mb-2 opacity-30" />
              No items pending review
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <span className="text-xs text-gray-400">{pendingApproval.length} item{pendingApproval.length !== 1 ? 's' : ''} pending review</span>
                <button
                  onClick={bulkPublish}
                  disabled={bulkPublishing}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {bulkPublishing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  Publish All
                </button>
              </div>
            <div className="divide-y divide-gray-800/60">
              {pendingApproval.map(item => (
                <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{item.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{item.content_type.replace(/_/g, ' ')}</span>
                      {item.published_at && <span>• {new Date(item.published_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setViewing(item)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                      title="Preview"
                    >
                      <Eye size={13} />
                    </button>
                    <button
                      onClick={() => setApproval(item.id, 'approved')}
                      disabled={approving === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={12} /> Approve
                    </button>
                    <button
                      onClick={() => setApproval(item.id, 'draft')}
                      disabled={approving === item.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* List tab */}
      {activeTab === 'list' && (
        <>
          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {f === 'all' ? 'All' : f.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Content table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-[11px] text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5">Title</th>
                  <th className="text-left px-4 py-2.5 hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5 hidden md:table-cell"><Eye size={11} className="inline mr-1" />Views</th>
                  <th className="text-right px-4 py-2.5 hidden md:table-cell"><Users size={11} className="inline mr-1" />Leads</th>
                  <th className="text-right px-4 py-2.5 hidden lg:table-cell"><DollarSign size={11} className="inline" />Revenue</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {loading && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-gray-600">
                      <RefreshCw size={18} className="animate-spin mx-auto mb-2" />Loading…
                    </td>
                  </tr>
                )}
                {!loading && list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10">
                      <SmartEmptyState page="content" />
                    </td>
                  </tr>
                )}
                {list.map((item, i) => (
                  <tr key={i} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2.5 max-w-xs">
                      <div className="text-xs text-gray-200 truncate" title={item.title}>{item.title}</div>
                      {item.slug && <div className="text-[10px] text-gray-600 font-mono truncate mt-0.5">/{item.slug}</div>}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                        {TYPE_ICONS[item.content_type] ?? <FileText size={13} className="text-gray-500" />}
                        {item.content_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_COLORS[item.status] ?? STATUS_COLORS.draft}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 hidden md:table-cell">{item.pageviews.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 hidden md:table-cell">{item.leads_generated}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-400 hidden lg:table-cell">
                      ${parseFloat(item.revenue_attr || '0').toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => repurpose(item.id)}
                          disabled={repurposing === item.id}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-purple-400 hover:bg-purple-900/20 transition-colors disabled:opacity-50"
                          title="Repurpose to social"
                        >
                          {repurposing === item.id ? <RefreshCw size={13} className="animate-spin" /> : <Share2 size={13} />}
                        </button>
                        <button
                          onClick={() => setViewing(item)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 transition-colors"
                          title="View post"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
