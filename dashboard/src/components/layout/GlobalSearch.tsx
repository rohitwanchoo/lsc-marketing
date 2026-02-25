'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Users, BookOpen, Hash, Package } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

interface SearchResults {
  leads: any[];
  content: any[];
  keywords: any[];
  products: any[];
}

export function GlobalSearch() {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(p => !p);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults(null); }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) setResults(await res.json());
      } catch {}
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function navigate(path: string) {
    router.push(path);
    setOpen(false);
  }

  const hasResults = results && (
    results.leads.length + results.content.length + results.keywords.length + results.products.length > 0
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors w-full"
      >
        <Search size={13} />
        <span className="flex-1 text-left text-xs">Search...</span>
        <kbd className="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-500">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search leads, content, keywords, products..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 focus:outline-none"
          />
          {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />}
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300 shrink-0"><X size={14} /></button>
        </div>

        {hasResults && results && (
          <div className="max-h-96 overflow-y-auto py-2">
            {results.leads.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><Users size={10} /> Leads</div>
                {results.leads.map((l: any) => (
                  <button key={l.id} onClick={() => navigate('/leads')}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800 text-left">
                    <span className="text-sm text-white">{l.full_name || l.email}</span>
                    <span className="text-xs text-gray-500">{l.company}</span>
                    <span className="ml-auto text-xs text-gray-600">{l.stage}</span>
                  </button>
                ))}
              </div>
            )}
            {results.content.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><BookOpen size={10} /> Content</div>
                {results.content.map((c: any) => (
                  <button key={c.id} onClick={() => navigate('/content')}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800 text-left">
                    <span className="text-sm text-white truncate">{c.title}</span>
                    <span className="ml-auto text-xs text-gray-600">{c.content_type}</span>
                  </button>
                ))}
              </div>
            )}
            {results.keywords.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><Hash size={10} /> Keywords</div>
                {results.keywords.map((k: any) => (
                  <button key={k.id} onClick={() => navigate('/keywords')}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800 text-left">
                    <span className="text-sm text-white">{k.keyword}</span>
                    <span className="ml-auto text-xs text-gray-600">pos {k.serp_position ?? '—'}</span>
                  </button>
                ))}
              </div>
            )}
            {results.products.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5 text-[10px] text-gray-500 uppercase tracking-wider"><Package size={10} /> Products</div>
                {results.products.map((p: any) => (
                  <button key={p.id} onClick={() => navigate('/products')}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-800 text-left">
                    <span className="text-sm text-white">{p.name}</span>
                    <span className="text-xs text-gray-500 truncate">{p.website_url}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {query.length >= 2 && !loading && !hasResults && (
          <div className="text-center py-8 text-gray-600 text-sm">No results for "{query}"</div>
        )}

        <div className="px-4 py-2 border-t border-gray-800 flex items-center gap-4 text-[10px] text-gray-600">
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
