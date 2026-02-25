'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { X } from 'lucide-react';
import {
  LayoutDashboard, Users, Search, TrendingUp, FlaskConical,
  BookOpen, DollarSign, Zap, Activity, Globe, ListTodo, LogOut, Radio, Settings,
} from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import { GlobalSearch } from './GlobalSearch';

const NAV = [
  { href: '/overview',     label: 'Overview',     icon: LayoutDashboard },
  { href: '/products',     label: 'Products',     icon: Globe },
  { href: '/leads',        label: 'Leads',        icon: Users },
  { href: '/keywords',     label: 'Keywords',     icon: Search },
  { href: '/content',      label: 'Content',      icon: BookOpen },
  { href: '/experiments',  label: 'Experiments',  icon: FlaskConical },
  { href: '/revenue',      label: 'Revenue',      icon: DollarSign },
  { href: '/social',       label: 'Social',       icon: TrendingUp },
  { href: '/agents',       label: 'Agents',       icon: Activity },
  { href: '/playbooks',    label: 'Playbooks',    icon: Zap },
  { href: '/jobs',         label: 'Job Queue',    icon: ListTodo },
  { href: '/activity',     label: 'Live Activity', icon: Radio },
  { href: '/settings',     label: 'Settings',     icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const path = usePathname();

  return (
    <aside className={`
      w-56 min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col
      fixed left-0 top-0 z-50 transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      md:translate-x-0
    `}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">LSC Platform</div>
            <div className="text-[10px] text-green-400 font-medium">ORGANIC MODE</div>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || (href !== '/overview' && path.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-blue-600/20 text-blue-400 font-medium'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-800 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-600">Autonomous loop active</div>
            <div className="mt-1 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-green-400">All agents running</span>
            </div>
          </div>
          <NotificationCenter />
        </div>
        <div className="pb-1">
          <GlobalSearch />
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-900/10 transition-all w-full"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </aside>
  );
}
