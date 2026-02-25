'use client';
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface PageIntroProps {
  page: string;
  icon: React.ReactNode;
  title: string;
  auto: string;
  yourJob: string;
  outcome: string;
}

export function PageIntro({ page, icon, title, auto, yourJob, outcome }: PageIntroProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const val = localStorage.getItem(`page_intro_${page}`);
      if (val === '1') setCollapsed(true);
    }
  }, [page]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== 'undefined') {
      if (next) localStorage.setItem(`page_intro_${page}`, '1');
      else localStorage.removeItem(`page_intro_${page}`);
    }
  }

  if (!visible) return null;

  // Collapsed state — compact bar
  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-2 mb-5 bg-gray-900/60 border border-gray-800/60 rounded-xl text-left hover:border-gray-700 transition-colors group"
      >
        <span className="text-blue-400/70">{icon}</span>
        <span className="text-xs text-gray-500 flex-1">{title}</span>
        <ChevronDown size={12} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
      </button>
    );
  }

  // Expanded state
  return (
    <div className="mb-5 bg-gray-900/80 border border-blue-900/30 rounded-xl overflow-hidden transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-gray-800/50">
        <span className="text-blue-400">{icon}</span>
        <h2 className="text-sm font-semibold text-white flex-1">{title}</h2>
        <button
          onClick={toggle}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          <span>Got it</span>
          <ChevronUp size={12} />
        </button>
      </div>

      {/* Three-column info row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-gray-800/50">
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">Platform does automatically</div>
          <p className="text-xs text-gray-400 leading-relaxed">{auto}</p>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1.5">Your job</div>
          <p className="text-xs text-white leading-relaxed">{yourJob}</p>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wider mb-1.5">What to expect</div>
          <p className="text-xs text-green-400 leading-relaxed">{outcome}</p>
        </div>
      </div>
    </div>
  );
}
