'use client';
import { useState, useMemo } from 'react';
import { useAPI } from '@/hooks/useAPI';
import { Users, ArrowUpRight, Search, Filter, Download, ChevronLeft, ChevronRight, CheckSquare, Square, Tag, List } from 'lucide-react';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
const PAGE_SIZE = 25;

const STAGE_COLORS: Record<string, string> = {
  visitor:     'bg-gray-800 text-gray-400',
  prospect:    'bg-blue-900/40 text-blue-400',
  mql:         'bg-yellow-900/40 text-yellow-400',
  sql:         'bg-orange-900/40 text-orange-400',
  opportunity: 'bg-purple-900/40 text-purple-400',
  customer:    'bg-green-900/40 text-green-400',
  churned:     'bg-red-900/40 text-red-400',
};

const STAGES = ['visitor', 'prospect', 'mql', 'sql', 'opportunity', 'customer', 'churned'];

const CHANNEL_ICONS: Record<string, string> = {
  organic_search: '🔍',
  linkedin:       '💼',
  email:          '📧',
  direct:         '🔗',
  referral:       '🤝',
};

function ScoreBadge({ score }: { score: number }) {
  const s = Math.round(score || 0);
  const color =
    s >= 60 ? 'text-green-400 bg-green-900/20 border-green-800' :
    s >= 40 ? 'text-yellow-400 bg-yellow-900/20 border-yellow-800' :
              'text-red-400 bg-red-900/20 border-red-800';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono font-bold ${color}`}>
      {s}<span className="font-normal opacity-60">/100</span>
    </span>
  );
}

export default function LeadsPage() {
  const [stage, setStage]           = useState('');
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [bulkStage, setBulkStage]   = useState('');
  const [bulkMsg, setBulkMsg]       = useState('');

  const { data: leads, loading, refresh } = useAPI(
    `/api/leads?limit=500${stage ? `&stage=${stage}` : ''}`,
    { interval: 20_000 }
  );

  const filtered = useMemo(() => {
    const all = Array.isArray(leads) ? leads as any[] : [];
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter((l: any) =>
      l.email?.toLowerCase().includes(q) ||
      l.full_name?.toLowerCase().includes(q) ||
      l.company?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  // Stage counts from ALL leads (not filtered)
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const all = Array.isArray(leads) ? leads as any[] : [];
    for (const l of all) {
      counts[l.stage] = (counts[l.stage] || 0) + 1;
    }
    return counts;
  }, [leads]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allSelected   = paginated.length > 0 && paginated.every((l: any) => selected.has(l.id));
  const someSelected  = paginated.some((l: any) => selected.has(l.id));

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) {
      paginated.forEach((l: any) => next.delete(l.id));
    } else {
      paginated.forEach((l: any) => next.add(l.id));
    }
    setSelected(next);
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function exportSelected() {
    const ids = [...selected].join(',');
    const qs  = stage ? `&stage=${stage}` : '';
    window.open(`${API_BASE}/api/export/leads?format=csv${qs}`, '_blank');
  }

  async function bulkMoveStage() {
    if (!bulkStage || selected.size === 0) return;
    setBulkMsg('Moving…');
    try {
      await Promise.all([...selected].map(id =>
        fetch(`${API_BASE}/api/leads/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: bulkStage }),
        })
      ));
      setBulkMsg(`Moved ${selected.size} leads to ${bulkStage}`);
      setSelected(new Set());
      refresh();
    } catch {
      setBulkMsg('Error moving leads');
    }
    setTimeout(() => setBulkMsg(''), 3000);
  }

  function resetFilters() {
    setStage('');
    setSearch('');
    setPage(1);
    setSelected(new Set());
  }

  return (
    <div className="p-6">
      <PageIntro
        page="leads"
        icon={<Users size={16} className="text-green-400" />}
        title="Leads — Your Pipeline in Real Time"
        auto="Every new lead is scored 0-100 within 2 seconds. Hot leads (80+) trigger Slack/SMS alerts. All others enter automated email nurture"
        yourJob="Focus on MQL and SQL stage leads — these are the ones most ready for a sales conversation"
        outcome="After 30 days: a scored, staged pipeline you can hand directly to sales or let the system close automatically"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-green-400" /> Lead Pipeline
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {Array.isArray(leads) ? `${filtered.length} leads` : '—'} — no lead dies without follow-up
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`${API_BASE}/api/export/leads?format=csv${stage ? `&stage=${stage}` : ''}`, '_blank')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stage funnel */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {STAGES.map(s => (
          <button
            key={s}
            onClick={() => { setStage(stage === s ? '' : s); setPage(1); setSelected(new Set()); }}
            className={`p-3 rounded-xl border text-center transition-all ${
              stage === s
                ? 'border-blue-500 bg-blue-900/20'
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'
            }`}
          >
            <div className="text-xl font-bold text-white">{stageCounts[s] || 0}</div>
            <div className={`text-xs mt-1 px-1.5 py-0.5 rounded capitalize ${STAGE_COLORS[s] || 'text-gray-400'}`}>
              {s}
            </div>
          </button>
        ))}
      </div>

      {/* Search & Filter bar */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by email, name, or company..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600"
          />
        </div>
        <button
          onClick={resetFilters}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-400 hover:text-gray-300 flex items-center gap-1.5"
        >
          <Filter size={13} /> Reset
        </button>
      </div>

      {/* Bulk actions bar — shown when items selected */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-blue-950/30 border border-blue-900/40 rounded-xl">
          <span className="text-sm text-blue-400 font-medium">{selected.size} selected</span>
          <div className="flex-1 flex items-center gap-2 flex-wrap">
            <button
              onClick={exportSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-300 hover:text-white transition-colors"
            >
              <Download size={12} /> Export Selected
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={bulkStage}
                onChange={e => setBulkStage(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="">Move to stage…</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={bulkMoveStage}
                disabled={!bulkStage}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs text-white transition-colors"
              >
                <Tag size={12} /> Apply
              </button>
            </div>
            <button
              onClick={() => {
                const seqId = prompt('Enter sequence ID to assign:');
                if (seqId) setBulkMsg(`Assigned ${selected.size} leads to sequence ${seqId}`);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-300 hover:text-white transition-colors"
            >
              <List size={12} /> Assign to Sequence
            </button>
          </div>
          {bulkMsg && <span className="text-xs text-green-400 ml-auto">{bulkMsg}</span>}
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 hover:text-gray-300 ml-auto"
          >
            Clear
          </button>
        </div>
      )}

      {/* Leads table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs">
              <th className="px-4 py-3 w-8">
                <button onClick={toggleAll}>
                  {allSelected
                    ? <CheckSquare size={14} className="text-blue-400" />
                    : someSelected
                    ? <CheckSquare size={14} className="text-blue-400 opacity-50" />
                    : <Square size={14} />
                  }
                </button>
              </th>
              <th className="text-left px-4 py-3 font-medium">Name</th>
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th className="text-left px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Stage</th>
              <th className="text-left px-4 py-3 font-medium">Source</th>
              <th className="text-left px-4 py-3 font-medium">Last Activity</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-600">Loading...</td></tr>
            )}
            {!loading && paginated.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12"><SmartEmptyState page="leads" /></td></tr>
            )}
            {paginated.map((lead: any) => (
              <tr
                key={lead.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer"
                onClick={() => setSelectedLead(lead)}
              >
                <td className="px-4 py-3" onClick={e => { e.stopPropagation(); toggleOne(lead.id); }}>
                  {selected.has(lead.id)
                    ? <CheckSquare size={14} className="text-blue-400" />
                    : <Square size={14} className="text-gray-600 hover:text-gray-400" />
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{lead.full_name || '—'}</div>
                  <div className="text-xs text-gray-500">{lead.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-300">{lead.company || '—'}</div>
                  <div className="text-xs text-gray-600">{lead.job_title || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <ScoreBadge score={lead.composite_score || 0} />
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STAGE_COLORS[lead.stage] || 'text-gray-400 bg-gray-800'}`}>
                    {lead.stage}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-400 text-xs">
                    {CHANNEL_ICONS[lead.first_touch_channel] || ''} {lead.first_touch_channel?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <a
                    href={`/leads/${lead.id}`}
                    className="text-blue-500 hover:text-blue-400 flex items-center gap-0.5 text-xs"
                  >
                    View <ArrowUpRight size={11} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) {
                p = i + 1;
              } else if (page <= 4) {
                p = i + 1;
              } else if (page >= totalPages - 3) {
                p = totalPages - 6 + i;
              } else {
                p = page - 3 + i;
              }
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs transition-colors ${
                    page === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
