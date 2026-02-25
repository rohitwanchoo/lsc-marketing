'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Shield } from 'lucide-react';

const ROLE_COLORS: Record<string, string> = {
  admin:  'bg-red-900/30 text-red-400 border-red-800',
  editor: 'bg-blue-900/30 text-blue-400 border-blue-800',
  viewer: 'bg-gray-800 text-gray-400 border-gray-700',
};

export default function UsersPage() {
  const [users, setUsers]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm]     = useState({ email: '', name: '', role: 'viewer', password: '' });
  const [error, setError]   = useState('');

  async function fetchUsers() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchUsers(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Failed');
      return;
    }
    setForm({ email: '', name: '', role: 'viewer', password: '' });
    fetchUsers();
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user?')) return;
    await fetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchUsers();
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
        <Users size={18} className="text-blue-400" /> User Management
      </h2>

      <form onSubmit={createUser} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Add New User</h3>
        <div className="grid grid-cols-2 gap-3">
          <input required type="email" placeholder="Email"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <input type="text" placeholder="Name"
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <input required type="password" placeholder="Password"
            value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button type="submit" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus size={14} /> Add User
        </button>
      </form>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Role</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-600">Loading...</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-4 py-3 text-white">{u.email}</td>
                <td className="px-4 py-3 text-gray-400">{u.name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[u.role] || ROLE_COLORS.viewer}`}>
                    <Shield size={10} /> {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteUser(u.id)} className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
