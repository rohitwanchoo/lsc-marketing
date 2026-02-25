'use client';
import { useAPI } from '@/hooks/useAPI';
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight, ShieldAlert } from 'lucide-react';
import { PageIntro } from '@/components/guidance';

const CHANNEL_COLORS: Record<string, string> = {
  organic_search: '#3b82f6',
  linkedin:       '#8b5cf6',
  email:          '#f59e0b',
  direct:         '#10b981',
  referral:       '#ec4899',
  unknown:        '#6b7280',
};

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6b7280', '#14b8a6', '#f97316'];

export default function RevenuePage() {
  const { data: summary }    = useAPI('/api/revenue/summary',        { interval: 60_000 });
  const { data: keywords }   = useAPI('/api/keywords',               { interval: 60_000 });
  const { data: content }    = useAPI('/api/content',                { interval: 60_000 });
  const { data: costs }      = useAPI('/api/cost/summary',           { interval: 60_000 });
  const { data: budget }     = useAPI('/api/cost/budget',            { interval: 60_000 });
  const { data: channelRoi } = useAPI('/api/analytics/channel-roi',  { interval: 120_000 });

  // MRR chart data
  const chartData = Array.isArray(summary)
    ? (summary as any[]).map((r: any) => ({
        month:     r.month ? new Date(r.month).toLocaleDateString('en', { month: 'short', year: '2-digit' }) : '',
        new_mrr:   Number(r.new_mrr   || 0),
        expansion: Number(r.expansion || 0),
        churn:     Number(r.churn     || 0),
        net:       Number(r.new_mrr || 0) + Number(r.expansion || 0) - Number(r.churn || 0),
      }))
    : [];

  const totalRevenue = chartData.reduce((sum, r) => sum + r.net, 0);
  const totalAICost  = Array.isArray(costs)
    ? (costs as any[]).reduce((sum: number, c: any) => sum + Number(c.total_cost_usd || 0), 0)
    : 0;

  // Month-over-month comparison
  const lastMonth = chartData[chartData.length - 1];
  const prevMonth = chartData[chartData.length - 2];
  const momChange = lastMonth && prevMonth && prevMonth.net > 0
    ? ((lastMonth.net - prevMonth.net) / prevMonth.net) * 100
    : null;

  // Attribution pie chart data
  const pieData = Array.isArray(channelRoi)
    ? (channelRoi as any[])
        .filter((c: any) => c.revenue_usd > 0)
        .map((c: any, i: number) => ({
          name:  c.channel?.replace(/_/g, ' ') || 'unknown',
          value: Number(c.revenue_usd || 0),
          color: CHANNEL_COLORS[c.channel] || PIE_COLORS[i % PIE_COLORS.length],
        }))
    : [];

  const totalAttributed = pieData.reduce((s, d) => s + d.value, 0);

  // Leads count from channelRoi for cost-per-lead
  const totalLeadsFromChannels = Array.isArray(channelRoi)
    ? (channelRoi as any[]).reduce((s: number, c: any) => s + Number(c.leads || 0), 0)
    : 0;

  return (
    <div className="p-6">
      <PageIntro
        page="revenue"
        icon={<DollarSign size={16} className="text-purple-400" />}
        title="Revenue — What's Actually Making Money"
        auto="Every sale is traced back to the exact keyword, page, and email that closed it using a U-shaped attribution model"
        yourJob="Review the keyword and content attribution tables. Scale what has the highest revenue per lead"
        outcome="After 60 days: clear ROI per keyword and content piece so you know exactly where to double down"
      />
      <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
        <DollarSign size={20} className="text-purple-400" /> Revenue Attribution
      </h1>
      <p className="text-gray-500 text-sm mb-6">Every dollar traced back to its keyword, page, and channel</p>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Total Revenue (12mo)',
            value: `$${totalRevenue.toLocaleString()}`,
            color: 'text-purple-400',
            sub: momChange !== null
              ? { icon: momChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />,
                  text: `${Math.abs(momChange).toFixed(1)}% MoM`,
                  color: momChange >= 0 ? 'text-green-400' : 'text-red-400' }
              : null,
          },
          {
            label: 'AI Cost (30d)',
            value: `$${totalAICost.toFixed(2)}`,
            color: 'text-orange-400',
            sub: null,
          },
          {
            label: 'Revenue / AI$',
            value: totalAICost > 0 ? `${(totalRevenue / totalAICost).toFixed(0)}x` : '—',
            color: 'text-green-400',
            sub: null,
          },
          {
            label: 'Keywords with Revenue',
            value: String(Array.isArray(keywords) ? (keywords as any[]).filter((k: any) => k.total_revenue > 0).length : 0),
            color: 'text-blue-400',
            sub: null,
          },
        ].map(kpi => (
          <div key={kpi.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            {kpi.sub && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${kpi.sub.color}`}>
                {kpi.sub.icon}{kpi.sub.text}
              </div>
            )}
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
                <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Area type="monotone" dataKey="net"       stroke="#a855f7" fill="url(#gradNet)" name="Net Revenue" />
            <Area type="monotone" dataKey="new_mrr"   stroke="#3b82f6" fill="url(#gradNew)" strokeDasharray="4 2" name="New MRR" />
            <Area type="monotone" dataKey="churn"     stroke="#ef4444" fill="none" strokeDasharray="4 2" name="Churn" />
            <Area type="monotone" dataKey="expansion" stroke="#10b981" fill="none" strokeDasharray="4 2" name="Expansion" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Attribution pie + MoM comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Attribution pie */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Channel</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: 11 }}
                    formatter={(v: any) => [`$${Number(v).toLocaleString()}`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-300 flex-1 capitalize">{d.name}</span>
                    <span className="text-gray-400 font-medium">${d.value.toLocaleString()}</span>
                    <span className="text-gray-600">{totalAttributed > 0 ? `${((d.value / totalAttributed) * 100).toFixed(0)}%` : '—'}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-gray-600 text-xs text-center py-12">No attribution data yet</div>
          )}
        </div>

        {/* Month-over-month stats */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Month-over-Month</h3>
          {lastMonth ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">This Month Revenue</div>
                <div className="text-2xl font-bold text-purple-400">${(lastMonth.net || 0).toLocaleString()}</div>
                {momChange !== null && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${momChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {momChange >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(momChange).toFixed(1)}% vs last month
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">New MRR</div>
                  <div className="text-lg font-bold text-blue-400">${(lastMonth.new_mrr || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Churn</div>
                  <div className="text-lg font-bold text-red-400">${(lastMonth.churn || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Expansion</div>
                  <div className="text-lg font-bold text-green-400">${(lastMonth.expansion || 0).toLocaleString()}</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Prev Month</div>
                  <div className="text-lg font-bold text-gray-400">${(prevMonth?.net || 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-gray-600 text-xs text-center py-12">No monthly data yet</div>
          )}
        </div>

        {/* Channel ROI table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Channel ROI</h3>
          <div className="space-y-2">
            {Array.isArray(channelRoi) && (channelRoi as any[]).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: CHANNEL_COLORS[c.channel] || '#6b7280' }}
                />
                <span className="text-gray-300 capitalize flex-1">{c.channel?.replace(/_/g, ' ') || 'unknown'}</span>
                <span className="text-gray-500">{c.leads} leads</span>
                <span className="text-purple-400 font-semibold">${Number(c.revenue_usd || 0).toLocaleString()}</span>
              </div>
            ))}
            {(!channelRoi || (channelRoi as any[]).length === 0) && (
              <div className="text-gray-600 text-xs text-center py-6">No data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* Two-column: top keywords + top content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Revenue by Keyword */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Keyword</h3>
          <div className="space-y-2">
            {Array.isArray(keywords) && (keywords as any[]).filter((k: any) => k.total_revenue > 0).slice(0, 8).map((k: any, i: number) => {
              const maxRev = (keywords as any[]).filter((x: any) => x.total_revenue > 0)[0]?.total_revenue || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-gray-300 truncate">{k.keyword}</div>
                    <div className="mt-0.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.min(100, (k.total_revenue / maxRev) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-purple-400 font-semibold">${Number(k.total_revenue || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-gray-600">{k.total_leads} leads</div>
                  </div>
                </div>
              );
            })}
            {(!keywords || !(keywords as any[]).some((k: any) => k.total_revenue > 0)) && (
              <div className="text-gray-600 text-xs text-center py-4">No revenue data yet</div>
            )}
          </div>
        </div>

        {/* Revenue by Content */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">Revenue by Content</h3>
          <div className="space-y-2">
            {Array.isArray(content) && (content as any[]).filter((c: any) => c.revenue_attr > 0).slice(0, 8).map((c: any, i: number) => {
              const maxRev = (content as any[]).filter((x: any) => x.revenue_attr > 0)[0]?.revenue_attr || 1;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-gray-300 truncate">{c.title}</div>
                    <div className="mt-0.5 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${Math.min(100, (c.revenue_attr / maxRev) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-600 mt-0.5 capitalize">
                      {c.content_type} · {c.leads_generated} leads
                    </div>
                  </div>
                  <div className="text-xs text-blue-400 font-semibold shrink-0 w-16 text-right">
                    ${Number(c.revenue_attr || 0).toLocaleString()}
                  </div>
                </div>
              );
            })}
            {(!content || !(content as any[]).some((c: any) => c.revenue_attr > 0)) && (
              <div className="text-gray-600 text-xs text-center py-4">No revenue data yet</div>
            )}
          </div>
        </div>
      </div>

      {/* AI Cost breakdown */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-400">AI Operating Cost (30d)</h3>
          <div className="text-xs text-gray-600">
            Cost/lead: {totalLeadsFromChannels > 0
              ? <span className="text-orange-400 font-medium">${(totalAICost / totalLeadsFromChannels).toFixed(2)}</span>
              : '—'
            }
          </div>
        </div>
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
            {Array.isArray(costs) && (costs as any[]).map((c: any, i: number) => (
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
    ? { bar: 'bg-red-500',    text: 'text-red-400',    badge: 'bg-red-900/40 text-red-400 border-red-800',       label: 'Exceeded' }
    : budget.status === 'warning'
    ? { bar: 'bg-yellow-500', text: 'text-yellow-400', badge: 'bg-yellow-900/40 text-yellow-400 border-yellow-800', label: 'Warning' }
    : { bar: 'bg-green-500',  text: 'text-green-400',  badge: 'bg-green-900/40 text-green-400 border-green-800',   label: 'On track' };

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

