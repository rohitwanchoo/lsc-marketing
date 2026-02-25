'use client';
import { useState, useEffect } from 'react';
import {
  X, Mail, Phone, Building2, Tag, Clock, Send, User,
  RefreshCw, ChevronRight, Activity, FileText, Star,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  email_sent:   <Mail    size={13} className="text-blue-400" />,
  page_visit:   <Activity size={13} className="text-green-400" />,
  form_submit:  <FileText size={13} className="text-yellow-400" />,
  stage_change: <ChevronRight size={13} className="text-purple-400" />,
  call:         <Phone   size={13} className="text-orange-400" />,
  note:         <FileText size={13} className="text-gray-400" />,
  enriched:     <Star    size={13} className="text-sky-400" />,
};

const STAGE_COLORS: Record<string, string> = {
  visitor:     'text-gray-400',
  prospect:    'text-blue-400',
  mql:         'text-yellow-400',
  sql:         'text-orange-400',
  opportunity: 'text-purple-400',
  customer:    'text-green-400',
  churned:     'text-red-400',
};

interface Lead {
  id: string;
  email: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  stage: string;
  composite_score: number;
  owner_email?: string;
}

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function LeadDrawer({ lead, onClose }: Props) {
  const [timeline, setTimeline]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [ownerInput, setOwnerInput] = useState('');
  const [seqId, setSeqId]         = useState('');
  const [msg, setMsg]             = useState('');

  useEffect(() => {
    if (!lead) return;
    setOwnerInput(lead.owner_email || '');
    setTimeline([]);
    setLoading(true);
    fetch(`${API_BASE}/api/leads/${lead.id}/timeline`)
      .then(r => r.json())
      .then(d => setTimeline(Array.isArray(d) ? d : []))
      .catch(() => setTimeline([]))
      .finally(() => setLoading(false));
  }, [lead?.id]);

  if (!lead) return null;

  async function enrich() {
    setEnriching(true);
    try {
      await fetch(`${API_BASE}/api/leads/${lead!.id}/enrich`, { method: 'POST' });
      setMsg('Lead enriched from HubSpot');
      // Refresh timeline
      const res = await fetch(`${API_BASE}/api/leads/${lead!.id}/timeline`);
      setTimeline(await res.json());
    } catch { setMsg('Enrichment failed'); }
    setEnriching(false);
  }

  async function triggerSequence() {
    try {
      await fetch(`${API_BASE}/api/leads/${lead!.id}/trigger-sequence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence_id: seqId }),
      });
      setMsg('Email sequence triggered');
    } catch { setMsg('Failed to trigger sequence'); }
  }

  async function assignOwner() {
    try {
      await fetch(`${API_BASE}/api/leads/${lead!.id}/owner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_email: ownerInput }),
      });
      setMsg('Owner assigned');
    } catch { setMsg('Failed to assign owner'); }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 h-full w-96 z-50 bg-gray-950 border-l border-gray-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-white">{lead.full_name || lead.email}</h2>
            <p className="text-xs text-gray-500">{lead.email}</p>
            {lead.company && (
              <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                <Building2 size={10} /> {lead.company}
                {lead.job_title && ` · ${lead.job_title}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        {/* Score + Stage */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-800">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{lead.composite_score ?? '—'}</div>
            <div className="text-[10px] text-gray-500">Score</div>
          </div>
          <div className="text-center">
            <div className={`text-sm font-semibold capitalize ${STAGE_COLORS[lead.stage] || 'text-gray-400'}`}>
              {lead.stage}
            </div>
            <div className="text-[10px] text-gray-500">Stage</div>
          </div>
          {lead.owner_email && (
            <div className="flex items-center gap-1 ml-auto text-xs text-gray-500">
              <User size={11} /> {lead.owner_email}
            </div>
          )}
        </div>

        {/* Flash message */}
        {msg && (
          <div className="mx-5 mt-3 px-3 py-2 bg-green-900/30 border border-green-800 rounded-lg text-xs text-green-400">
            {msg}
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-3 border-b border-gray-800 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={enrich}
              disabled={enriching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {enriching ? <RefreshCw size={12} className="animate-spin" /> : <Star size={12} />}
              Enrich
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text" placeholder="sequence_id"
              value={seqId} onChange={e => setSeqId(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={triggerSequence}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
            >
              <Send size={12} /> Trigger Email
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="email" placeholder="owner@company.com"
              value={ownerInput} onChange={e => setOwnerInput(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={assignOwner}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              <User size={12} /> Assign
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock size={11} /> Timeline
          </h3>
          {loading ? (
            <div className="text-center py-8 text-gray-600 text-xs">Loading timeline...</div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-8 text-gray-700 text-xs">No events yet</div>
          ) : (
            <div className="space-y-3">
              {timeline.map((event, i) => (
                <div key={event.id || i} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-6 h-6 bg-gray-800 rounded-full flex items-center justify-center">
                    {EVENT_ICONS[event.event_type] ?? <Activity size={11} className="text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300 capitalize">{event.event_type.replace(/_/g, ' ')}</div>
                    {event.event_data && Object.keys(event.event_data).length > 0 && (
                      <div className="text-[10px] text-gray-600 mt-0.5 truncate">
                        {JSON.stringify(event.event_data).slice(0, 80)}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-700 mt-0.5">
                      {new Date(event.created_at).toLocaleString()}
                      {event.source && ` · ${event.source}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
