'use client';
import { useState } from 'react';
import { useAPI, triggerAgent } from '@/hooks/useAPI';
import { FlaskConical, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

export default function ExperimentsPage() {
  const { data: experiments, loading } = useAPI('/api/experiments', { interval: 15_000 });
  const [scaling, setScaling] = useState<Record<string, 'loading' | 'done' | 'error'>>({});

  const running  = Array.isArray(experiments) ? (experiments as any[]).filter(e => e.status === 'running') : [];
  const winners  = Array.isArray(experiments) ? (experiments as any[]).filter(e => e.status === 'winner_found') : [];
  const killed   = Array.isArray(experiments) ? (experiments as any[]).filter(e => e.status === 'killed' || e.status === 'inconclusive') : [];

  async function scaleWinner(exp: any) {
    setScaling(s => ({ ...s, [exp.id]: 'loading' }));
    try {
      // Use the winning variant's content asset
      const winnerContentId = exp.winner === 'a' ? exp.content_a : exp.content_b;
      await triggerAgent('compounding_growth', 'scale_winner', {
        type:   'content',
        id:     winnerContentId || exp.id,
        reason: `Experiment "${exp.name}" winner — variant ${exp.winner?.toUpperCase()} at ${exp.confidence?.toFixed(1)}% confidence`,
        action: 'apply_winning_pattern',
      });
      setScaling(s => ({ ...s, [exp.id]: 'done' }));
      setTimeout(() => setScaling(s => { const n = { ...s }; delete n[exp.id]; return n; }), 3000);
    } catch {
      setScaling(s => ({ ...s, [exp.id]: 'error' }));
      setTimeout(() => setScaling(s => { const n = { ...s }; delete n[exp.id]; return n; }), 3000);
    }
  }

  return (
    <div className="p-6">
      <PageIntro
        page="experiments"
        icon={<FlaskConical size={16} className="text-yellow-400" />}
        title="Experiments — Automatic A/B Testing"
        auto="Inbound Conversion Agent creates and runs A/B tests on landing pages. Winner auto-declared at 90%+ statistical confidence"
        yourJob="When a winner is found, click 'Scale Winner' to apply it across all similar pages. Otherwise just watch"
        outcome="After 60 days: 20-40% conversion rate improvements from continuous automated experimentation"
      />
      <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
        <FlaskConical size={20} className="text-yellow-400" /> Experiment Engine
      </h1>
      <p className="text-gray-500 text-sm mb-6">AI creates, runs, and decides every A/B test — winners scaled automatically</p>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-blue-900/40 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
            <RefreshCw size={13} /> Running
          </div>
          <div className="text-3xl font-bold text-blue-400">{running.length}</div>
        </div>
        <div className="bg-gray-900 border border-green-900/40 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
            <CheckCircle size={13} /> Winners Found
          </div>
          <div className="text-3xl font-bold text-green-400">{winners.length}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <AlertCircle size={13} /> Killed/Inconclusive
          </div>
          <div className="text-3xl font-bold text-gray-500">{killed.length}</div>
        </div>
      </div>

      {/* Experiment list */}
      <div className="space-y-3">
        {loading && <div className="text-center py-12 text-gray-600">Loading experiments...</div>}
        {!loading && (!experiments || (experiments as any[]).length === 0) && (
          <SmartEmptyState page="experiments" />
        )}
        {Array.isArray(experiments) && (experiments as any[]).map((exp: any, i: number) => {
          const scaleState = scaling[exp.id];
          return (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-white text-sm">{exp.name}</h3>
                    <StatusBadge status={exp.status} />
                  </div>
                  <p className="text-xs text-gray-500">{exp.hypothesis}</p>
                  {exp.element && (
                    <div className="mt-1 text-xs text-gray-600">Testing: <span className="text-gray-400">{exp.element}</span></div>
                  )}
                </div>

                {/* Stats + Scale button */}
                <div className="text-right shrink-0">
                  {exp.confidence && (
                    <div className={`text-lg font-bold ${
                      exp.confidence >= 95 ? 'text-green-400' :
                      exp.confidence >= 80 ? 'text-yellow-400' : 'text-gray-500'
                    }`}>
                      {exp.confidence.toFixed(1)}%
                    </div>
                  )}
                  {exp.confidence && <div className="text-xs text-gray-600">confidence</div>}
                  {exp.winner && (
                    <div className="mt-1 text-xs text-green-400 font-semibold">
                      Winner: Variant {exp.winner.toUpperCase()}
                      {exp.winner_uplift && ` (+${(exp.winner_uplift * 100).toFixed(1)}%)`}
                    </div>
                  )}

                  {/* Scale Winner button — only for winner_found experiments */}
                  {exp.status === 'winner_found' && (
                    <button
                      onClick={() => scaleWinner(exp)}
                      disabled={!!scaleState}
                      className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-auto ${
                        scaleState === 'done'    ? 'bg-green-900/40 text-green-400 border border-green-800 cursor-default' :
                        scaleState === 'error'   ? 'bg-red-900/40 text-red-400 border border-red-800 cursor-default' :
                        scaleState === 'loading' ? 'bg-gray-800 text-gray-400 border border-gray-700 cursor-wait' :
                        'bg-purple-600 hover:bg-purple-500 text-white border border-transparent'
                      }`}
                    >
                      {scaleState === 'loading' ? (
                        <><RefreshCw size={11} className="animate-spin" /> Scaling…</>
                      ) : scaleState === 'done' ? (
                        <><CheckCircle size={11} /> Scaled</>
                      ) : scaleState === 'error' ? (
                        <><AlertCircle size={11} /> Failed</>
                      ) : (
                        <><Zap size={11} /> Scale Winner</>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* AB split bars */}
              {(exp.visitors_a > 0 || exp.visitors_b > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(['a', 'b'] as const).map(v => {
                    const visitors    = v === 'a' ? exp.visitors_a    : exp.visitors_b;
                    const conversions = v === 'a' ? exp.conversions_a : exp.conversions_b;
                    const rate        = visitors ? ((conversions / visitors) * 100).toFixed(1) : '0';
                    const isWinner    = exp.winner === v;
                    return (
                      <div key={v} className={`p-3 rounded-lg ${isWinner ? 'bg-green-900/20 border border-green-800' : 'bg-gray-800/50'}`}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400 font-medium">Variant {v.toUpperCase()}</span>
                          {isWinner && <span className="text-green-400">Winner</span>}
                        </div>
                        <div className="text-lg font-bold text-white">{rate}%</div>
                        <div className="text-xs text-gray-600">{visitors} visitors · {conversions} conv.</div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-700">
                <Clock size={10} />
                <span>Started {exp.started_at ? new Date(exp.started_at).toLocaleDateString() : '—'}</span>
                {exp.ended_at && <span>• Ended {new Date(exp.ended_at).toLocaleDateString()}</span>}
                {exp.agent_decision && <span>• AI: {exp.agent_decision}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    running:      'bg-blue-900/40 text-blue-400',
    winner_found: 'bg-green-900/40 text-green-400',
    inconclusive: 'bg-yellow-900/40 text-yellow-400',
    killed:       'bg-gray-800 text-gray-500',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded capitalize ${cfg[status] || 'bg-gray-800 text-gray-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function RefreshCw({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M8 16H3v5"/>
    </svg>
  );
}
