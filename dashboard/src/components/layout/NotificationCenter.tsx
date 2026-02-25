'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck, AlertTriangle, Info, Zap } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  agent_failure:     <AlertTriangle size={13} className="text-red-400" />,
  experiment_winner: <Zap size={13} className="text-yellow-400" />,
  info:              <Info size={13} className="text-blue-400" />,
};

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read_at).length;

  async function fetchNotifications() {
    try {
      const res = await fetch(`${API_BASE}/api/notifications`);
      if (res.ok) setNotifications(await res.json());
    } catch {}
  }

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 10_000);
    return () => clearInterval(t);
  }, []);

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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">No notifications</div>
            ) : notifications.slice(0, 20).map(n => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${!n.read_at ? 'bg-blue-950/20' : ''}`}
              >
                <div className="mt-0.5 shrink-0">{TYPE_ICONS[n.type] ?? <Info size={13} className="text-gray-500" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white">{n.title}</div>
                  {n.message && <div className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</div>}
                  <div className="text-[10px] text-gray-600 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.read_at && (
                  <button onClick={() => markRead(n.id)} className="shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
