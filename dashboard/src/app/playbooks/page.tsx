'use client';
import { useAPI, triggerAgent } from '@/hooks/useAPI';
import { useState } from 'react';
import { Zap, CheckCircle, Clock, ChevronDown, ChevronUp, Play } from 'lucide-react';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

export default function PlaybooksPage() {
  const { data: playbooks, loading, refresh } = useAPI('/api/playbooks', { interval: 60_000 });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning]   = useState<string | null>(null);

  async function handleExtract() {
    setRunning('extract');
    try {
      await triggerAgent('compounding_growth', 'extract_patterns', {});
      setTimeout(refresh, 3000);
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="p-6">
      <PageIntro
        page="playbooks"
        icon={<Zap size={16} className="text-cyan-400" />}
        title="Playbooks — Proven Growth Patterns"
        auto="Compounding Growth Agent extracts reusable patterns from your top-performing content, keywords, emails, and posts every Thursday"
        yourJob="Review AI-extracted playbooks. Each one shows trigger conditions and action steps that can be applied to 10x more angles"
        outcome="After 90 days: a library of proven growth recipes that systematically scale your MRR"
      />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap size={20} className="text-cyan-400" /> Growth Playbooks
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Proven patterns that compound — each one applies automatically when conditions are met
          </p>
        </div>
        <button
          onClick={handleExtract}
          disabled={running === 'extract'}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
        >
          <Play size={14} />
          {running === 'extract' ? 'Extracting...' : 'Extract New Patterns'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Active Playbooks', value: Array.isArray(playbooks) ? playbooks.filter((p: any) => p.is_active).length : 0 },
          { label: 'Total Applied',    value: Array.isArray(playbooks) ? playbooks.reduce((s: number, p: any) => s + (p.times_applied || 0), 0) : 0 },
          { label: 'Categories',       value: Array.isArray(playbooks) ? new Set((playbooks as any[]).map((p: any) => p.category)).size : 0 },
          { label: 'Avg ROI',          value: Array.isArray(playbooks) ? `${((playbooks as any[]).reduce((s: number, p: any) => s + Number(p.avg_roi || 0), 0) / Math.max((playbooks as any[]).length, 1)).toFixed(0)}x` : '—' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500">{stat.label}</div>
            <div className="text-2xl font-bold text-cyan-400 mt-1">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Playbook cards */}
      <div className="space-y-3">
        {loading && (
          <div className="text-center py-12 text-gray-600">Loading playbooks...</div>
        )}
        {Array.isArray(playbooks) && playbooks.map((pb: any) => (
          <div key={pb.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-gray-800/30 transition-colors"
              onClick={() => setExpanded(expanded === pb.id ? null : pb.id)}
            >
              <div className="mt-0.5">
                <CheckCircle size={16} className={pb.is_active ? 'text-green-400' : 'text-gray-600'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white text-sm">{pb.name}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded">{pb.category}</span>
                  {pb.times_applied > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-cyan-900/30 text-cyan-400 rounded">
                      Applied {pb.times_applied}×
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 line-clamp-1">{pb.description}</p>
              </div>
              <div className="ml-auto">
                {expanded === pb.id
                  ? <ChevronUp size={14} className="text-gray-500" />
                  : <ChevronDown size={14} className="text-gray-500" />
                }
              </div>
            </button>

            {expanded === pb.id && (
              <div className="px-5 pb-5 border-t border-gray-800 pt-4">
                <div className="grid grid-cols-2 gap-6">
                  {/* Trigger conditions */}
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Trigger Conditions</div>
                    {pb.trigger_conditions ? (
                      <pre className="text-xs text-gray-400 bg-gray-800/50 rounded p-3 overflow-x-auto">
                        {JSON.stringify(
                          typeof pb.trigger_conditions === 'string'
                            ? JSON.parse(pb.trigger_conditions)
                            : pb.trigger_conditions,
                          null, 2
                        )}
                      </pre>
                    ) : (
                      <div className="text-xs text-gray-600">No conditions defined</div>
                    )}
                  </div>

                  {/* Action steps */}
                  <div>
                    <div className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Action Steps</div>
                    {pb.action_steps ? (
                      <div className="space-y-1.5">
                        {(typeof pb.action_steps === 'string'
                          ? JSON.parse(pb.action_steps)
                          : pb.action_steps
                        ).map((step: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className="text-cyan-400 font-mono">{step.step}.</span>
                            <div>
                              <span className="text-gray-300">{step.action}</span>
                              {step.agent && <span className="text-gray-600 ml-1">→ {step.agent}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">No steps defined</div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-gray-600">
                  <Clock size={11} />
                  Created {pb.created_at ? new Date(pb.created_at).toLocaleDateString() : '—'}
                  {pb.created_by && <span>• by {pb.created_by.replace(/_/g, ' ')}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && (!playbooks || (playbooks as any[]).length === 0) && (
          <SmartEmptyState page="playbooks" />
        )}
      </div>
    </div>
  );
}
