import { ClipboardList, LayoutDashboard, LogOut, ShieldCheck, ShieldHalf, Boxes, Sparkles, Settings } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signOut } from 'next-auth/react';
import React from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/risks', label: 'Risks', icon: ShieldHalf },
  { href: '/assessments', label: 'Assessments', icon: ClipboardList },
  { href: '/frameworks', label: 'Frameworks', icon: Boxes },
  { href: '/data-analysis', label: 'Data Analysis', icon: Sparkles },
  { href: '/settings/ai', label: 'AI Settings', icon: Settings },
] as const;

interface AppHeaderProps {
  userEmail?: string;
}

/**
 * The one persistent piece of chrome every signed-in page shares — previously each top-level page
 * (dashboard, risks, assessments, frameworks) hand-rolled its own nav bar, and only dashboard.tsx's
 * actually had links to the other three, so navigating from e.g. Risks to Frameworks meant a detour
 * back through the dashboard first. Detail/sub-pages keep their own back-link + heading beneath
 * this, matching a standard app-bar-plus-breadcrumb layout.
 */
export function AppHeader({ userEmail }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-slate-900/80">
      <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-white shrink-0">
          <ShieldCheck className="h-6 w-6 text-blue-500" strokeWidth={2.25} />
          <span className="font-bold tracking-tight">CMMP</span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = router.pathname === href || router.pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          {userEmail && <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[14rem]">{userEmail}</span>}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
