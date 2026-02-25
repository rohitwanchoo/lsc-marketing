'use client';
import { useState } from 'react';
import { useAPI } from '@/hooks/useAPI';
import { Users, ArrowUpRight, Search, Filter, Download } from 'lucide-react';
import { LeadDrawer } from '@/components/leads/LeadDrawer';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const STAGE_COLORS: Record<string, string> = {
  visitor:     'bg-gray-800 text-gray-400',
  prospect:    'bg-blue-900/40 text-blue-400',
  mql:         'bg-yellow-900/40 text-yellow-400',
  sql:         'bg-orange-900/40 text-orange-400',
  opportunity: 'bg-purple-900/40 text-purple-400',
  customer:    'bg-green-900/40 text-green-400',
  churned:     'bg-red-900/40 text-red-400',
};

const CHANNEL_ICONS: Record<string, string> = {
  organic_search: '🔍',
  linkedin:       '💼',
  email:          '📧',
  direct:         '🔗',
  referral:       '🤝',
};

export default function LeadsPage() {
  const [stage, setStage]       = useState('');
  const [search, setSearch]     = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);

  const { data: leads, loading } = useAPI(
    `/api/leads${stage ? `?stage=${stage}` : ''}`,
    { interval: 20_000 }
  );

  const filtered = Array.isArray(leads)
    ? leads.filter((l: any) =>
        !search ||
        l.email?.includes(search) ||
        l.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        l.company?.toLowerCase().includes(search.toLowerCase())
      )
    : [];

  // Stage summary
  const stageCounts: Record<string, number> = {};
  if (Array.isArray(leads)) {
    for (const l of leads as any[]) {
      stageCounts[l.stage] = (stageCounts[l.stage] || 0) + 1;
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-green-400" /> Lead Pipeline
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {Array.isArray(leads) ? `${leads.length} leads` : '—'} — no lead dies without follow-up
          </p>
        </div>
        <button
          onClick={() => window.open(`${API_BASE}/api/export/leads`, '_blank')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Stage funnel */}
      <div className="grid grid-cols-7 gap-2 mb-6">
        {['visitor','prospect','mql','sql','opportunity','customer','churned'].map(s => (
          <button
            key={s}
            onClick={() => setStage(stage === s ? '' : s)}
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by email, name, or company..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600"
          />
        </div>
        <button
          onClick={() => { setStage(''); setSearch(''); }}
          className="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-400 hover:text-gray-300 flex items-center gap-1.5"
        >
          <Filter size={13} /> Reset
        </button>
      </div>

      {/* Leads table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-500 text-xs">
              <th className="text-left px-4 py-3 font-medium">Lead</th>
              <th className="text-left px-4 py-3 font-medium">Company</th>
              <th className="text-left px-4 py-3 font-medium">Stage</th>
              <th className="text-right px-4 py-3 font-medium">Score</th>
              <th className="text-left px-4 py-3 font-medium">Source</th>
              <th className="text-left px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-600">Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-600">No leads match filters</td></tr>
            )}
            {filtered.map((lead: any) => (
              <tr key={lead.id} className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer" onClick={() => setSelectedLead(lead)}>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{lead.full_name || '—'}</div>
                  <div className="text-xs text-gray-500">{lead.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-300">{lead.company || '—'}</div>
                  <div className="text-xs text-gray-600">{lead.job_title || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${STAGE_COLORS[lead.stage] || 'text-gray-400 bg-gray-800'}`}>
                    {lead.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <ScoreBadge score={lead.composite_score || 0} />
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-400">
                    {CHANNEL_ICONS[lead.first_touch_channel] || '—'} {lead.first_touch_channel?.replace(/_/g, ' ') || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3">
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
      <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-gray-500';
  return (
    <div className={`font-mono font-bold ${color}`}>
      {Math.round(score)}
      <span className="text-gray-600 font-normal text-xs">/100</span>
    </div>
  );
}
