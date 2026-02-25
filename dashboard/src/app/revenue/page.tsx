'use client';
import { useAPI } from '@/hooks/useAPI';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DollarSign, TrendingUp, Target, ShieldAlert } from 'lucide-react';

export default function RevenuePage() {
  const { data: summary }  = useAPI('/api/revenue/summary', { interval: 60_000 });
  const { data: keywords } = useAPI('/api/keywords', { interval: 60_000 });
  const { data: content }  = useAPI('/api/content', { interval: 60_000 });
  const { data: costs }    = useAPI('/api/cost/summary', { interval: 60_000 });
  const { data: budget }   = useAPI('/api/cost/budget', { interval: 60_000 });
  const { data: channelRoi } = useAPI('/api/analytics/channel-roi', { interval: 120_000 });
  const { data: cohort }     = useAPI('/api/analytics/cohort',      { interval: 120_000 });

  const chartData = Array.isArray(summary)
    ? summary.map((r: any) => ({
        month:     r.month ? new Date(r.month).toLocaleDateString('en', { month: 'short' }) : '',
        new_mrr:   Number(r.new_mrr   || 0),
        expansion: Number(r.expansion || 0),
        churn:     Number(r.churn     || 0),
        net:       Number(r.new_mrr || 0) + Number(r.expansion || 0) - Number(r.churn || 0),
      }))
    : [];

  const totalRevenue = chartData.reduce((sum, r) => sum + r.net, 0);
  const totalAICost  = Array.isArray(costs)
    ? costs.reduce((sum: number, c: any) => sum + Number(c.total_cost_usd || 0), 0)
    : 0;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
        <DollarSign size={20} className="text-purple-400" /> Revenue Attribution
      </h1>
      <p className="text-gray-500 text-sm mb-6">Every dollar traced back to its keyword, page, and channel</p>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Revenue (12mo)', value: `$${totalRevenue.toLocaleString()}`, color: 'text-purple-400' },
          { label: 'AI Cost (30d)',        value: `$${totalAICost.toFixed(2)}`,         color: 'text-orange-400' },
          { label: 'Revenue/AI$',         value: totalAICost > 0 ? `${(totalRevenue / totalAICost).toFixed(0)}x` : '—', color: 'text-green-400' },
          { label: 'Keywords Generating Revenue', value: String(Array.isArray(keywords) ? keywords.filter((k: any) => k.total_revenue > 0).length : 0), color: 'text-blue-400' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* MRR Chart */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">Monthly Revenue (Organic)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']}
            />
            <Area type="monotone" dataKey="net"    stroke="#a855f7" fill="url(#gradNet)" name="Net MRR" />
            <Area type="monotone" dataKey="new_mrr"  stroke="#3b82f6" fill="none" strokeDasharray="4 2" name="New MRR" />
            <Area type="monotone" dataKey="churn"    stroke="#ef4444" fill="none" strokeDasharray="4 2" name="Churn" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two-column: top keywords + top content */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Revenue by Keyword */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Keyword</h3>
          <div className="space-y-2">
            {Array.isArray(keywords) && keywords.filter((k: any) => k.total_revenue > 0).slice(0, 8).map((k: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-xs text-gray-300 truncate">{k.keyword}</div>
                  <div className="mt-0.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${Math.min(100, (k.total_revenue / (keywords as any[])[0]?.total_revenue * 100) || 0)}%` }}
                    />
                  </div>
                </div>
                <div className="text-xs text-purple-400 font-semibold w-16 text-right">
                  ${Number(k.total_revenue || 0).toLocaleString()}
                </div>
              </div>
            ))}
            {(!keywords || !(keywords as any[]).some((k: any) => k.total_revenue > 0)) && (
              <div className="text-gray-600 text-xs text-center py-4">No revenue data yet</div>
            )}
          </div>
        </div>

        {/* Revenue by Content */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Content</h3>
          <div className="space-y-2">
            {Array.isArray(content) && content.filter((c: any) => c.revenue_attr > 0).slice(0, 8).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-xs text-gray-300 truncate">{c.title}</div>
                  <div className="mt-0.5 flex gap-2 text-[10px] text-gray-600">
                    <span>{c.content_type}</span>
                    <span>•</span>
                    <span>{c.leads_generated} leads</span>
                  </div>
                </div>
                <div className="text-xs text-blue-400 font-semibold w-16 text-right">
                  ${Number(c.revenue_attr || 0).toLocaleString()}
                </div>
              </div>
            ))}
            {(!content || !(content as any[]).some((c: any) => c.revenue_attr > 0)) && (
              <div className="text-gray-600 text-xs text-center py-4">No revenue data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* AI Cost breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">AI Operating Cost (30d)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-600">
              <th className="text-left pb-2">Agent</th>
              <th className="text-right pb-2">Runs</th>
              <th className="text-right pb-2">Tokens</th>
              <th className="text-right pb-2">Cost</th>
              <th className="text-right pb-2">Avg Duration</th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(costs) && costs.map((c: any, i: number) => (
              <tr key={i} className="border-b border-gray-800/40">
                <td className="py-2 text-gray-300 capitalize">{c.agent?.replace(/_/g, ' ')}</td>
                <td className="py-2 text-right text-gray-400">{c.runs}</td>
                <td className="py-2 text-right text-gray-400">{Number(c.total_tokens || 0).toLocaleString()}</td>
                <td className="py-2 text-right text-orange-400">${Number(c.total_cost_usd || 0).toFixed(3)}</td>
                <td className="py-2 text-right text-gray-500">{Math.round(c.avg_duration_ms || 0)}ms</td>
              </tr>
            ))}
            {(!costs || (costs as any[]).length === 0) && (
              <tr><td colSpan={5} className="text-center py-6 text-gray-600">No cost data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AI Budget Gauge */}
      <BudgetGauge budget={budget as any} />
    </div>
  );
}

function BudgetGauge({ budget }: { budget: any }) {
  if (!budget || !budget.period) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <ShieldAlert size={14} /> AI Budget data unavailable
        </div>
      </div>
    );
  }

  const pct       = Math.min(100, budget.percent_used ?? 0);
  const statusCfg = budget.status === 'exceeded'
    ? { bar: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-900/40 text-red-400 border-red-800',    label: 'Exceeded' }
    : budget.status === 'warning'
    ? { bar: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-400 border-yellow-800', label: 'Warning' }
    : { bar: 'bg-green-500',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-400 border-green-800',  label: 'On track' };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2">
          <ShieldAlert size={14} className={statusCfg.text} />
          AI Budget — {budget.period}
        </h3>
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${statusCfg.badge}`}>
          {statusCfg.label}
        </span>
      </div>

      {/* Numbers row */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <span className={`text-3xl font-bold ${statusCfg.text}`}>${Number(budget.spent_usd).toFixed(2)}</span>
          <span className="text-gray-500 text-sm ml-2">spent</span>
        </div>
        <div className="text-right">
          <div className="text-gray-400 text-sm">${Number(budget.budget_usd).toFixed(0)} budget</div>
          <div className="text-gray-600 text-xs">${Number(budget.remaining_usd).toFixed(2)} remaining</div>
        </div>
      </div>

      {/* Gauge bar */}
      <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-700 ${statusCfg.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>$0</span>
        <span className={`font-semibold ${statusCfg.text}`}>{pct.toFixed(1)}% used</span>
        <span>${Number(budget.budget_usd).toFixed(0)}</span>
      </div>

      {/* Alert flags */}
      {(budget.alert_80_sent || budget.alert_100_sent) && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
          {budget.alert_80_sent  && <span className="px-2 py-0.5 rounded bg-yellow-900/20 text-yellow-500 border border-yellow-900">80% alert sent</span>}
          {budget.alert_100_sent && <span className="px-2 py-0.5 rounded bg-red-900/20 text-red-500 border border-red-900">100% alert sent</span>}
          <span className="text-gray-700">Non-critical agents paused at 100%</span>
        </div>
      )}
    </div>
  );
}
