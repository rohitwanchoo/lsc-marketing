'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Bell, X, CheckCheck, AlertTriangle, Info, Zap, AlertCircle, ExternalLink } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  agent_failure:     <AlertTriangle size={13} className="text-red-400" />,
  experiment_winner: <Zap size={13} className="text-yellow-400" />,
  budget_warning:    <AlertCircle size={13} className="text-orange-400" />,
  lead_milestone:    <Bell size={13} className="text-green-400" />,
  info:              <Info size={13} className="text-blue-400" />,
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-yellow-500',
  info:     'bg-blue-500',
};

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read_at).length;

  async function fetchNotifications() {
    try {
      const res = await fetch(`${API_BASE}/api/notifications?unread=true&limit=20`);
      if (res.ok) {
        const unreadNotes = await res.json();
        // Also fetch up to 5 already-read ones for context
        const res2 = await fetch(`${API_BASE}/api/notifications?limit=5`);
        if (res2.ok) {
          const recent = await res2.json();
          // Merge: unread first, then recent (deduplicated)
          const seen = new Set(unreadNotes.map((n: any) => n.id));
          const merged = [...unreadNotes, ...recent.filter((n: any) => !seen.has(n.id))];
          setNotifications(merged.slice(0, 20));
        } else {
          setNotifications(unreadNotes);
        }
      }
    } catch {}
  }

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function markRead(id: string) {
    await fetch(`${API_BASE}/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications(p => p.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
  }

  async function markAllRead() {
    await fetch(`${API_BASE}/api/notifications/read-all`, { method: 'PATCH' });
    const now = new Date().toISOString();
    setNotifications(p => p.map(n => ({ ...n, read_at: n.read_at || now })));
  }

  // Show at most 5 in the dropdown
  const preview = notifications.slice(0, 5);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-10 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">
              Notifications
              {unread > 0 && (
                <span className="ml-1.5 text-xs font-normal text-gray-500">({unread} unread)</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <CheckCheck size={12} /> All read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-72 overflow-y-auto">
            {preview.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">No notifications</div>
            ) : preview.map(n => {
              const isUnread = !n.read_at;
              const severity = n.severity || 'info';
              return (
                <div
                  key={n.id}
                  onClick={() => { if (isUnread) markRead(n.id); }}
                  className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors cursor-pointer ${isUnread ? 'bg-blue-950/10' : ''}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type] ?? <Info size={13} className="text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-white leading-snug">{n.title}</div>
                    {n.message && (
                      <div className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</div>
                    )}
                    <div className="text-[10px] text-gray-600 mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </div>
                  {isUnread && (
                    <span className={`shrink-0 w-2 h-2 rounded-full mt-1 ${SEVERITY_DOT[severity] || 'bg-blue-500'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer — View all link */}
          <div className="px-4 py-2.5 border-t border-gray-800">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink size={11} /> View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
