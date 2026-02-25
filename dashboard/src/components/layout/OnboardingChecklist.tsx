'use client';
import { useState, useEffect } from 'react';
import { CheckCircle, Circle, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const STEPS = [
  { key: 'integrations_configured', label: 'Configure at least one integration', href: '/settings' },
  { key: 'has_content',             label: 'Generate your first content asset', href: '/agents' },
  { key: 'has_leads',               label: 'Capture your first lead',           href: '/leads' },
];

export function OnboardingChecklist() {
  const [status, setStatus]         = useState<any>(null);
  const [dismissed, setDismissed]   = useState(false);

  useEffect(() => {
    const d = localStorage.getItem('onboarding_dismissed');
    if (d) { setDismissed(true); return; }
    fetch(`${API_BASE}/api/onboarding/status`)
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => {});
  }, []);

  function dismiss() {
    localStorage.setItem('onboarding_dismissed', '1');
    setDismissed(true);
  }

  if (dismissed || !status || status.complete) return null;

  const completed = STEPS.filter(s => status[s.key]).length;

  return (
    <div className="bg-gray-900 border border-blue-900/50 rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Getting Started</h3>
          <p className="text-xs text-gray-500 mt-0.5">{completed}/{STEPS.length} steps complete</p>
        </div>
        <button onClick={dismiss} className="text-gray-600 hover:text-gray-400"><X size={14} /></button>
      </div>
      <div className="space-y-1.5">
        {STEPS.map(step => {
          const done = status[step.key];
          return (
            <Link key={step.key} href={step.href}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${done ? 'opacity-50' : 'hover:bg-gray-800'}`}>
              {done
                ? <CheckCircle size={15} className="text-green-400 shrink-0" />
                : <Circle size={15} className="text-gray-600 shrink-0" />
              }
              <span className={`text-sm flex-1 ${done ? 'line-through text-gray-500' : 'text-gray-300'}`}>{step.label}</span>
              {!done && <ChevronRight size={12} className="text-gray-600" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
