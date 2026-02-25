'use client';
import { useState, useMemo } from 'react';
import {
  Bell, CheckCheck, Trash2, AlertTriangle, Info, Zap,
  AlertCircle, RefreshCw, X,
} from 'lucide-react';
import { PageIntro } from '@/components/guidance';
import {
  useNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type Notification,
} from '@/hooks/useAPI';

const TYPE_ICONS: Record<string, React.ReactNode> = {
  agent_failure:     <AlertTriangle size={15} className="text-red-400" />,
  experiment_winner: <Zap size={15} className="text-yellow-400" />,
  budget_warning:    <AlertCircle size={15} className="text-orange-400" />,
  lead_milestone:    <Bell size={15} className="text-green-400" />,
  info:              <Info size={15} className="text-blue-400" />,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-l-4 border-red-500 bg-red-950/10',
  warning:  'border-l-4 border-yellow-500 bg-yellow-950/10',
  info:     'border-l-4 border-blue-600 bg-blue-950/10',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-900/40 text-red-400 border-red-800',
  warning:  'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  info:     'bg-blue-900/40 text-blue-400 border-blue-800',
};

const FILTER_TYPES = ['all', 'agent_failure', 'experiment_winner', 'budget_warning', 'lead_milestone', 'info'];

function groupByDate(notifications: Notification[]): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    const date = new Date(n.created_at);
    const today    = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else {
      label = date.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  }
  return groups;
}

export default function NotificationsPage() {
  const [typeFilter, setTypeFilter]   = useState('all');
  const { data: rawNotifications, loading, refresh } = useNotifications({ limit: 200 });

  const [localState, setLocalState] = useState<Record<string, { read?: boolean; deleted?: boolean }>>({});

  const notifications = useMemo(() => {
    const all = (rawNotifications ?? []).filter(n => !localState[n.id]?.deleted);
    return typeFilter === 'all' ? all : all.filter(n => n.type === typeFilter);
  }, [rawNotifications, typeFilter, localState]);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read_at && !localState[n.id]?.read).length,
    [notifications, localState]
  );

  const grouped = useMemo(() => groupByDate(notifications), [notifications]);

  async function handleMarkRead(n: Notification) {
    if (n.read_at || localState[n.id]?.read) return;
    setLocalState(p => ({ ...p, [n.id]: { ...p[n.id], read: true } }));
    try { await markNotificationRead(n.id); } catch {}
  }

  async function handleMarkAllRead() {
    setLocalState(p => {
      const next = { ...p };
      notifications.forEach(n => { if (!n.read_at) next[n.id] = { ...next[n.id], read: true }; });
      return next;
    });
    try { await markAllNotificationsRead(); } catch {}
  }

  async function handleDelete(n: Notification) {
    setLocalState(p => ({ ...p, [n.id]: { ...p[n.id], deleted: true } }));
    try { await deleteNotification(n.id); } catch {}
  }

  function isRead(n: Notification) {
    return !!n.read_at || !!localState[n.id]?.read;
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageIntro
        page="notifications"
        icon={<Bell size={16} className="text-blue-400" />}
        title="Notifications — Platform Alerts That Need Your Attention"
        auto="The platform sends alerts when: an agent fails, an experiment finds a winner, AI budget thresholds are hit, or lead milestones are reached"
        yourJob="Review critical (red) alerts. Experiment winner alerts are the most valuable — scale those immediately"
        outcome="Stay informed without watching dashboards all day — only see what actually requires action"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell size={20} className="text-blue-400" /> Notifications
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <CheckCheck size={14} /> Mark all read
            </button>
          )}
          <button
            onClick={refresh}
            className="p-2 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_TYPES.map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              typeFilter === t
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {t === 'all' ? 'All' : t.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {loading && (
        <div className="flex justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-blue-400" />
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div className="text-center py-16 text-gray-600">
          <Bell size={32} className="mx-auto mb-3 opacity-30" />
          <p>No notifications</p>
        </div>
      )}

      {!loading && Object.entries(grouped).map(([dateLabel, items]) => (
        <div key={dateLabel} className="mb-6">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            {dateLabel}
          </div>
          <div className="space-y-2">
            {items.map(n => {
              const read = isRead(n);
              const severity = (n as any).severity || 'info';
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border border-gray-800 cursor-pointer transition-all ${
                    SEVERITY_STYLES[severity] || SEVERITY_STYLES.info
                  } ${!read ? 'shadow-sm' : 'opacity-70'}`}
                  onClick={() => handleMarkRead(n)}
                >
                  <div className="shrink-0 mt-0.5">
                    {TYPE_ICONS[n.type] ?? <Info size={15} className="text-gray-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${read ? 'text-gray-400' : 'text-white'}`}>
                        {n.title}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${SEVERITY_BADGE[severity] || SEVERITY_BADGE.info}`}>
                        {severity}
                      </span>
                      {!read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                      )}
                    </div>
                    {n.message && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-600">
                      <span>{new Date(n.created_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}</span>
                      <span className="capitalize">{n.type?.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(n); }}
                    className="shrink-0 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    title="Delete"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
