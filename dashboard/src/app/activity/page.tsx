'use client';
import { useState } from 'react';
import { useSSE, ActivityEvent } from '@/hooks/useSSE';
import { Radio, Zap, User, TrendingUp, BookOpen, AlertCircle, X, type LucideIcon } from 'lucide-react';

// ─── Event type config ────────────────────────────────────────────────────────

interface EventCfg {
  label:  string;
  icon:   LucideIcon;
  accent: string;
  card:   string;
}

const EVENT_CONFIG: Record<string, EventCfg> = {
  'intent_spike': {
    label:  'Intent Spike',
    icon:   Zap,
    accent: 'text-red-400',
    card:   'border-red-900/50 bg-red-900/10',
  },
  'lead.scored': {
    label:  'Lead Scored',
    icon:   User,
    accent: 'text-green-400',
    card:   'border-green-900/50 bg-green-900/10',
  },
  'lead.stage_changed': {
    label:  'Stage Changed',
    icon:   TrendingUp,
    accent: 'text-blue-400',
    card:   'border-blue-900/50 bg-blue-900/10',
  },
  'content.published': {
    label:  'Content Published',
    icon:   BookOpen,
    accent: 'text-purple-400',
    card:   'border-purple-900/50 bg-purple-900/10',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({ ev }: { ev: ActivityEvent }) {
  const cfg: EventCfg = EVENT_CONFIG[ev.type] ?? {
    label:  ev.type,
    icon:   AlertCircle,
    accent: 'text-gray-400',
    card:   'border-gray-800 bg-gray-900',
  };
  const Icon = cfg.icon;
  const d    = ev.data;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border ${cfg.card}`}>
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-gray-900/60">
        <Icon size={13} className={cfg.accent} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs font-semibold ${cfg.accent}`}>{cfg.label}</span>
          <span className="text-[10px] text-gray-600 shrink-0">{elapsed(ev.ts)}</span>
        </div>

        {ev.type === 'intent_spike' && (
          <div className="mt-1 text-xs text-gray-300">
            <span className="font-medium">{d.email ?? 'Unknown lead'}</span>
            {d.company && <span className="text-gray-500"> @ {d.company}</span>}
            <span className="ml-2 text-red-400 font-semibold">Intent {d.intentScore ?? '—'}/100</span>
            {d.compositeScore && <span className="ml-2 text-gray-500">composite {d.compositeScore}</span>}
            {d.trigger && <span className="ml-2 text-gray-600">via {d.trigger.replace(/_/g, ' ')}</span>}
          </div>
        )}

        {ev.type === 'lead.scored' && (
          <div className="mt-1 text-xs text-gray-300">
            Scored <span className="font-semibold text-green-400">{d.compositeScore ?? '—'}/100</span>
            {d.stage && <span className="ml-2 text-gray-500">stage: <span className="text-gray-300">{d.stage}</span></span>}
            {d.leadId && <span className="ml-2 font-mono text-gray-600 text-[10px]">{d.leadId.slice(0, 8)}…</span>}
          </div>
        )}

        {ev.type === 'lead.stage_changed' && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{d.oldStage ?? '?'}</span>
            <span className="text-gray-600">→</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 font-medium">{d.newStage ?? '?'}</span>
            {d.leadId && <span className="ml-1 font-mono text-gray-600 text-[10px]">{d.leadId.slice(0, 8)}…</span>}
          </div>
        )}

        {ev.type === 'content.published' && (
          <div className="mt-1 text-xs text-gray-300">
            <span className="font-medium">{d.title ?? 'Untitled'}</span>
            {d.contentType && <span className="ml-2 text-gray-500">[{d.contentType.replace(/_/g, ' ')}]</span>}
            {d.slug && <span className="ml-2 font-mono text-gray-600 text-[10px]">/{d.slug}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  active, label, count, color, onClick,
}: {
  active: boolean; label: string; count: number; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? `${color} border-current bg-current/10`
          : 'text-gray-500 border-gray-800 hover:border-gray-600 hover:text-gray-400'
      }`}
    >
      {label} <span className="opacity-60">({count})</span>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { events, connected, error, clear } = useSSE('/api/live-activity');
  const [filter, setFilter] = useState<string | null>(null);

  const displayed = filter ? events.filter(e => e.type === filter) : events;

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio size={20} className="text-green-400" />
            Live Activity
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Real-time events from the autonomous revenue loop
          </p>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          connected
            ? 'bg-green-900/20 border-green-800 text-green-400'
            : 'bg-gray-900 border-gray-700 text-gray-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          {connected ? 'Live' : error ? 'Reconnecting…' : 'Connecting…'}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-400 text-xs">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {(Object.entries(EVENT_CONFIG) as [string, EventCfg][]).map(([type, cfg]) => (
          <div key={type} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className={`text-xs font-medium ${cfg.accent} mb-1`}>{cfg.label}</div>
            <div className="text-2xl font-bold text-white">{counts[type] || 0}</div>
          </div>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill
            active={filter === null}
            label="All"
            count={events.length}
            color="text-white"
            onClick={() => setFilter(null)}
          />
          {(Object.entries(EVENT_CONFIG) as [string, EventCfg][]).map(([type, cfg]) =>
            counts[type] ? (
              <FilterPill
                key={type}
                active={filter === type}
                label={cfg.label}
                count={counts[type]}
                color={cfg.accent}
                onClick={() => setFilter(filter === type ? null : type)}
              />
            ) : null
          )}
        </div>

        {events.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Event list */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radio size={36} className="text-gray-700 mb-4" />
          <p className="text-gray-500 font-medium">Waiting for events…</p>
          <p className="text-gray-600 text-sm mt-1">
            Events appear here as leads score, stages change, and content publishes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(ev => <EventCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  );
}
