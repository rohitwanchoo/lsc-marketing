'use client';
import { useAPI, triggerAgent } from '@/hooks/useAPI';
import { useState } from 'react';
import { TrendingUp, Eye, Heart, MessageSquare, ExternalLink, RefreshCw, Trash2, Download } from 'lucide-react';
import { PageIntro, SmartEmptyState } from '@/components/guidance';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

const PLATFORM_COLORS: Record<string, string> = {
  linkedin:  'bg-blue-900/30 text-blue-400 border-blue-800',
  twitter:   'bg-sky-900/30 text-sky-400 border-sky-800',
  instagram: 'bg-pink-900/30 text-pink-400 border-pink-800',
};

export default function SocialPage() {
  const { data: posts, loading, refresh } = useAPI('/api/social/posts', { interval: 30_000 });
  const [platform,           setPlatform]           = useState('');
  const [generating,         setGenerating]         = useState(false);
  const [removingUnassigned, setRemovingUnassigned] = useState(false);
  const [deletingAll,        setDeletingAll]        = useState(false);
  const [deletingDrafts,     setDeletingDrafts]     = useState(false);

  const allPosts        = Array.isArray(posts) ? (posts as any[]) : [];
  const filtered        = allPosts.filter((p: any) => !platform || p.platform === platform);
  const unassignedCount = allPosts.filter((p: any) => !p.content_asset_id).length;
  const draftCount      = allPosts.filter((p: any) => !p.published_at).length;

  async function deleteDrafts() {
    if (!confirm(`Delete all ${draftCount} draft/scheduled post${draftCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeletingDrafts(true);
    try {
      await fetch(`${API_BASE}/api/social/posts/drafts`, { method: 'DELETE' });
      refresh();
    } finally {
      setDeletingDrafts(false);
    }
  }

  async function deleteAll() {
    if (!confirm(`Delete all ${allPosts.length} social post${allPosts.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setDeletingAll(true);
    try {
      await fetch(`${API_BASE}/api/social/posts`, { method: 'DELETE' });
      refresh();
    } finally {
      setDeletingAll(false);
    }
  }

  async function removeUnassigned() {
    if (!confirm(`Remove all ${unassignedCount} unassigned post${unassignedCount !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setRemovingUnassigned(true);
    try {
      await fetch(`${API_BASE}/api/social/posts/unassigned`, { method: 'DELETE' });
      refresh();
    } finally {
      setRemovingUnassigned(false);
    }
  }

  const totals = {
    impressions: filtered.reduce((s, p) => s + (p.impressions || 0), 0),
    engagements: filtered.reduce((s, p) => s + (p.engagements || 0), 0),
    leads:       filtered.reduce((s, p) => s + (p.leads_generated || 0), 0),
  };

  async function generateLinkedIn() {
    setGenerating(true);
    try {
      await triggerAgent('authority_content', 'linkedin_strategy', {
        weekTheme: 'organic growth without paid ads',
        recentWins: [],
        icp: 'B2B SaaS founders',
        painPoints: ['slow lead gen', 'high CAC'],
      });
      setTimeout(refresh, 3000);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6">
      <PageIntro
        page="social"
        icon={<TrendingUp size={16} className="text-pink-400" />}
        title="Social — Automated LinkedIn Distribution"
        auto="Social Distribution Agent repurposes published content into platform-native posts, publishes on schedule, and flags buyer signals from engagement"
        yourJob="Review scheduled posts before they go live. Check the engagement tab for leads who commented or liked"
        outcome="After 30 days: consistent LinkedIn presence generating inbound attention without any manual posting"
      />
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-pink-400" /> Social Distribution
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Attention → Intent signals → Pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open(`${API_BASE}/api/export/social-posts`, '_blank')}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
          <button
          onClick={generateLinkedIn}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
        >
          {generating ? <RefreshCw size={14} className="animate-spin" /> : <TrendingUp size={14} />}
          Generate This Week's LinkedIn Plan
        </button>
        </div>
      </div>

      {/* Destructive actions row */}
      {allPosts.length > 0 && (
        <div className="flex items-center gap-2 mb-6">
          {draftCount > 0 && (
            <button
              onClick={deleteDrafts}
              disabled={deletingDrafts}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 rounded-lg transition-colors disabled:opacity-50"
            >
              {deletingDrafts ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete {draftCount} drafts
            </button>
          )}
          {unassignedCount > 0 && (
            <button
              onClick={removeUnassigned}
              disabled={removingUnassigned}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 rounded-lg transition-colors disabled:opacity-50"
            >
              {removingUnassigned ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Remove {unassignedCount} unassigned
            </button>
          )}
          <button
            onClick={deleteAll}
            disabled={deletingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 rounded-lg transition-colors disabled:opacity-50"
          >
            {deletingAll ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Delete all posts
          </button>
        </div>
      )}


      {/* Platform stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Impressions', value: totals.impressions.toLocaleString(), icon: <Eye size={14} /> },
          { label: 'Total Engagements', value: totals.engagements.toLocaleString(), icon: <Heart size={14} /> },
          { label: 'Leads from Social', value: totals.leads.toLocaleString(),       icon: <MessageSquare size={14} /> },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
              {stat.icon} {stat.label}
            </div>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Platform filter */}
      <div className="flex gap-2 mb-4">
        {['', 'linkedin', 'twitter', 'instagram'].map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
              platform === p
                ? 'bg-blue-600 text-white'
                : 'bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {p || 'All Platforms'}
          </button>
        ))}
      </div>

      {/* Posts grid */}
      <div className="space-y-3">
        {loading && <div className="text-center py-12 text-gray-600">Loading posts...</div>}
        {!loading && filtered.length === 0 && (
          <SmartEmptyState page="social" />
        )}
        {filtered.map((post: any, i: number) => (
          <div key={i} className={`border rounded-xl p-4 ${PLATFORM_COLORS[post.platform] || 'bg-gray-900 border-gray-800'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="capitalize text-xs font-medium">{post.platform}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    post.published_at ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/40 text-yellow-400'
                  }`}>
                    {post.published_at ? 'Published' : 'Scheduled'}
                  </span>
                  {post.content_title && (
                    <span className="text-xs text-gray-600 truncate">← {post.content_title}</span>
                  )}
                </div>
                <p className="text-sm text-gray-300 line-clamp-3 whitespace-pre-line">
                  {post.post_body}
                </p>
                {post.hashtags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(post.hashtags as string[]).slice(0, 5).map((h, j) => (
                      <span key={j} className="text-[10px] text-gray-500">#{h}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="shrink-0 text-right space-y-1">
                <div className="text-xs text-gray-500">
                  <Eye size={10} className="inline mr-1" />
                  {(post.impressions || 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">
                  <Heart size={10} className="inline mr-1" />
                  {(post.engagements || 0).toLocaleString()}
                </div>
                {post.leads_generated > 0 && (
                  <div className="text-xs text-green-400 font-semibold">
                    {post.leads_generated} leads
                  </div>
                )}
                <div className="text-[10px] text-gray-700">
                  {post.scheduled_at
                    ? new Date(post.scheduled_at).toLocaleDateString()
                    : post.published_at
                      ? new Date(post.published_at).toLocaleDateString()
                      : '—'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
