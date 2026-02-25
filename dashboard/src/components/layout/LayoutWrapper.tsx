'use client';
import { usePathname } from 'next/navigation';

const NO_SIDEBAR_PATHS = ['/login'];

export function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hasSidebar = !NO_SIDEBAR_PATHS.includes(path);
  return (
    <main className={hasSidebar ? 'md:ml-56 min-h-screen' : 'min-h-screen'}>
      {children}
    </main>
  );
}
