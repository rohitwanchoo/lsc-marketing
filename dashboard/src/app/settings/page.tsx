'use client';
import { useState } from 'react';
import { Settings, Bell, Users, CheckCircle, XCircle, Eye, EyeOff, Zap, Copy, Check, Link } from 'lucide-react';
import UsersPage from './users/page';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const INTEGRATIONS = [
  { name: 'linkedin',  label: 'LinkedIn',         icon: '💼', description: 'Post publishing & engagement sync' },
  { name: 'hubspot',   label: 'HubSpot',           icon: '🔶', description: 'CRM contact & deal sync' },
  { name: 'slack',     label: 'Slack',             icon: '💬', description: 'Team notifications & alerts' },
  { name: 'ga4',       label: 'Google Analytics 4',icon: '📊', description: 'Traffic & conversion data' },
  { name: 'gsc',       label: 'Search Console',    icon: '🔍', description: 'SERP positions & impressions' },
  { name: 'sendgrid',  label: 'SendGrid',          icon: '📧', description: 'Email delivery & nurture sequences' },
  { name: 'ahrefs',    label: 'Ahrefs',            icon: '🌐', description: 'Keyword research & competitor analysis' },
];

function IntegrationCard({ name, label, icon, description }: any) {
  const [apiKey, setApiKey]         = useState('');
  const [enabled, setEnabled]       = useState(false);
  const [show, setShow]             = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [saved, setSaved]           = useState(false);

  async function save() {
    await fetch(`${API_BASE}/api/settings/integrations/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey || undefined, enabled }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testConn() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/integrations/test/${name}`, { method: 'POST' });
      setTestResult(await res.json());
    } catch { setTestResult({ ok: false, error: 'Network error' }); }
    setTesting(false);
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <div>
            <div className="text-sm font-semibold text-white">{label}</div>
            <div className="text-xs text-gray-500">{description}</div>
          </div>
        </div>
        <div onClick={() => setEnabled(p => !p)}
          className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-700'} relative`}>
          <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type={show ? 'text' : 'password'} placeholder="API Key"
            value={apiKey} onChange={e => setApiKey(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 pr-8"
          />
          <button onClick={() => setShow(p => !p)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
        <button onClick={save} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${saved ? 'bg-green-700 text-green-200' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
          {saved ? 'Saved!' : 'Save'}
        </button>
        <button onClick={testConn} disabled={testing} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition-colors">
          {testing ? '...' : 'Test'}
        </button>
      </div>
      {testResult && (
        <div className={`flex items-center gap-2 text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
          {testResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
          {testResult.ok ? `Connected (${testResult.latency_ms}ms)` : testResult.error}
        </div>
      )}
    </div>
  );
}

function WebhookCard() {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin.replace(':4002', '') : 'https://marketing.linkswitchcommunications.com';
  const webhookUrl = `${baseUrl}/webhook/lead`;
  const revenueUrl = `${baseUrl}/webhook/revenue`;

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Link size={15} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-white">Lead Capture Webhook URLs</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Send leads from any source (website forms, ads, partner portals) to these endpoints.
        Each lead is scored 0–100 in under 2 seconds and routed into your pipeline automatically.
      </p>
      <div className="space-y-3">
        {[
          { label: 'New Lead', method: 'POST', url: webhookUrl, key: 'lead', desc: 'Capture leads from website forms, landing pages, or any external source' },
          { label: 'Revenue Event', method: 'POST', url: revenueUrl, key: 'rev', desc: 'Record a sale or conversion — triggers attribution analysis automatically' },
        ].map(item => (
          <div key={item.key} className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">{item.method}</span>
                <span className="text-xs font-medium text-gray-300">{item.label}</span>
              </div>
              <button
                onClick={() => copy(item.url, item.key)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {copied === item.key ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                {copied === item.key ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <code className="block text-xs font-mono text-blue-300 bg-gray-950 rounded px-2 py-1.5 break-all">{item.url}</code>
            <p className="text-[11px] text-gray-500 mt-1.5">{item.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 text-[11px] text-gray-500 bg-gray-900/40 rounded-lg px-3 py-2">
        <span className="text-yellow-400 font-medium">Example lead payload:</span>{' '}
        <code className="font-mono text-gray-400">{'{ "email": "name@company.com", "company": "Acme", "source": "website" }'}</code>
      </div>
    </div>
  );
}

const TABS = ['Integrations', 'Alerts', 'Users'] as const;
type Tab = typeof TABS[number];

export default function SettingsPage() {
  const [tab, setTab]             = useState<Tab>('Integrations');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [alertSaved, setAlertSaved] = useState(false);

  async function saveAlerts() {
    await fetch(`${API_BASE}/api/settings/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhook_url: webhookUrl }),
    });
    setAlertSaved(true);
    setTimeout(() => setAlertSaved(false), 2000);
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={20} className="text-gray-400" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Integrations' && (
        <div className="space-y-6 max-w-3xl">
          <WebhookCard />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INTEGRATIONS.map(i => <IntegrationCard key={i.name} {...i} />)}
          </div>
        </div>
      )}

      {tab === 'Alerts' && (
        <div className="max-w-md space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
              <Bell size={14} className="text-yellow-400" /> Alert Webhook
            </h3>
            <p className="text-xs text-gray-500 mb-3">Receive agent failure alerts via Slack or any webhook URL.</p>
            <div className="flex gap-2">
              <input type="url" placeholder="https://hooks.slack.com/..."
                value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
              <button onClick={saveAlerts} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${alertSaved ? 'bg-green-700 text-green-200' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                {alertSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
            <p className="flex items-center gap-1.5"><Zap size={11} className="text-yellow-400" /> Triggers on 3+ consecutive agent failures</p>
            <p className="flex items-center gap-1.5"><Bell size={11} className="text-yellow-400" /> Notifications also appear in the bell icon above</p>
          </div>
        </div>
      )}

      {tab === 'Users' && <UsersPage />}
    </div>
  );
}
