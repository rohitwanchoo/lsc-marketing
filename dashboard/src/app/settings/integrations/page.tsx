'use client';
import { useState } from 'react';
import { useIntegrations, patchIntegration } from '@/hooks/useAPI';
import {
  Plug, CheckCircle, XCircle, RefreshCw, AlertTriangle,
  Clock, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';

const INTEGRATION_META: Record<string, { label: string; icon: string; description: string; docsUrl?: string }> = {
  sendgrid:  { label: 'SendGrid',            icon: '📧', description: 'Email delivery, nurture sequences and webhook events', docsUrl: 'https://docs.sendgrid.com' },
  hubspot:   { label: 'HubSpot',             icon: '🔶', description: 'CRM contact & deal sync, bi-directional pipeline updates', docsUrl: 'https://developers.hubspot.com' },
  linkedin:  { label: 'LinkedIn',            icon: '💼', description: 'Post publishing, engagement sync and intent signal detection', docsUrl: 'https://developer.linkedin.com' },
  twilio:    { label: 'Twilio',              icon: '📱', description: 'SMS alerts and outreach sequences', docsUrl: 'https://www.twilio.com/docs' },
  slack:     { label: 'Slack',               icon: '💬', description: 'Team notifications, agent failure alerts and lead alerts' },
  gsc:       { label: 'Google Search Console', icon: '🔍', description: 'SERP positions, impressions and click-through data sync', docsUrl: 'https://developers.google.com/search' },
  ahrefs:    { label: 'Ahrefs',              icon: '🌐', description: 'Keyword research, competitor gap analysis and SERP overview', docsUrl: 'https://ahrefs.com/api' },
  ga4:       { label: 'Google Analytics 4',  icon: '📊', description: 'Traffic sources, conversion events and audience data' },
};

// Integrations that might not be in DB yet — show them anyway
const ALL_INTEGRATION_NAMES = ['sendgrid', 'hubspot', 'linkedin', 'twilio', 'slack', 'gsc', 'ahrefs', 'ga4'];

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-700'}`}
    >
      <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

interface IntegrationRow {
  integration_name: string;
  enabled: boolean;
  config_json: Record<string, any>;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string | null;
}

function IntegrationCard({ row, onUpdate }: { row: IntegrationRow; onUpdate: () => void }) {
  const meta = INTEGRATION_META[row.integration_name] || {
    label:       row.integration_name,
    icon:        '🔌',
    description: 'Custom integration',
  };
  const [enabled, setEnabled]     = useState(row.enabled);
  const [expanded, setExpanded]   = useState(false);
  const [webhookUrl, setWebhookUrl] = useState((row.config_json?.webhook_url as string) || '');
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');

  async function handleToggle(val: boolean) {
    setEnabled(val);
    setSaving(true);
    try {
      await patchIntegration(row.integration_name, { enabled: val });
      setSaveMsg(val ? 'Enabled' : 'Disabled');
    } catch {
      setSaveMsg('Error saving');
      setEnabled(!val); // revert
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2000);
      onUpdate();
    }
  }

  async function saveWebhook() {
    setSaving(true);
    try {
      await patchIntegration(row.integration_name, { webhook_url: webhookUrl });
      setSaveMsg('Saved');
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2000);
      onUpdate();
    }
  }

  return (
    <div className={`bg-gray-900 border rounded-xl overflow-hidden transition-all ${
      enabled ? 'border-gray-700' : 'border-gray-800'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <span className="text-2xl shrink-0">{meta.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{meta.label}</span>
            {enabled
              ? <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle size={11} /> Connected</span>
              : <span className="flex items-center gap-1 text-xs text-gray-500"><XCircle size={11} /> Disabled</span>
            }
            {saving && <RefreshCw size={11} className="animate-spin text-blue-400" />}
            {saveMsg && <span className="text-xs text-blue-400">{saveMsg}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{meta.description}</p>
          {row.last_sync_at && (
            <div className="flex items-center gap-1 text-[10px] text-gray-600 mt-1">
              <Clock size={9} />
              Last sync: {new Date(row.last_sync_at).toLocaleString()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {meta.docsUrl && (
            <a href={meta.docsUrl} target="_blank" rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-400 transition-colors">
              <ExternalLink size={13} />
            </a>
          )}
          <ToggleSwitch enabled={enabled} onChange={handleToggle} />
          <button
            onClick={() => setExpanded(p => !p)}
            className="p-1 rounded text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Last error */}
      {row.last_error && (
        <div className="mx-5 mb-3 flex items-start gap-2 px-3 py-2 bg-red-950/20 border border-red-900/40 rounded-lg text-xs text-red-400">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{row.last_error}</span>
        </div>
      )}

      {/* Expanded config */}
      {expanded && (
        <div className="px-5 pb-4 border-t border-gray-800 pt-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Webhook URL (optional)</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.example.com/…"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={saveWebhook}
                disabled={saving}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs text-white font-medium transition-colors"
              >
                {saving ? '...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Config JSON preview */}
          {row.config_json && Object.keys(row.config_json).length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1.5">Current config</div>
              <div className="bg-gray-800 rounded-lg p-3 space-y-1">
                {Object.entries(row.config_json).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 font-mono min-w-[120px]">{k}</span>
                    <span className="text-gray-300 font-mono truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {row.updated_at && (
            <div className="text-[10px] text-gray-600">
              Last updated: {new Date(row.updated_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const { data: integrations, loading, refresh } = useIntegrations();

  // Merge DB rows with static list — so all integrations show even if not in DB yet
  const rows: IntegrationRow[] = ALL_INTEGRATION_NAMES.map(name => {
    const found = (integrations ?? []).find((i: any) => i.integration_name === name);
    return found ?? {
      integration_name: name,
      enabled:          false,
      config_json:      {},
      last_sync_at:     null,
      last_error:       null,
      updated_at:       null,
    };
  });

  const enabledCount  = rows.filter(r => r.enabled).length;
  const errorCount    = rows.filter(r => r.last_error).length;

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Plug size={20} className="text-blue-400" /> Integrations
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {enabledCount} of {rows.length} connected
            {errorCount > 0 && <span className="text-red-400 ml-2">· {errorCount} with errors</span>}
          </p>
        </div>
        <button
          onClick={refresh}
          className="p-2 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Connected',  value: enabledCount,          color: 'text-green-400' },
          { label: 'Disabled',   value: rows.length - enabledCount, color: 'text-gray-500' },
          { label: 'Errors',     value: errorCount,            color: errorCount > 0 ? 'text-red-400' : 'text-gray-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Integration cards */}
      <div className="space-y-3">
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-blue-400" />
          </div>
        )}
        {rows.map(row => (
          <IntegrationCard key={row.integration_name} row={row} onUpdate={refresh} />
        ))}
      </div>
    </div>
  );
}
