import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';
import { UserMenu } from '@/components/UserMenu';

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onManageNodes?: () => void;
}

export function PageLayout({ title, children, onManageNodes }: PageLayoutProps) {
  const gearIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  return (
    <AuthGate>
      <div className="min-h-screen pb-20 sm:pb-0">
        <div className="container-responsive">
          {/* Mobile page header */}
          <div className="sm:hidden flex items-center justify-between mb-4 pt-1">
            <h1 className="text-lg font-bold text-[var(--foreground)]">{title}</h1>
            <div className="flex items-center gap-2">
              {onManageNodes && (
                <button
                  onClick={onManageNodes}
                  className="w-9 h-9 rounded-full bg-[var(--active-bg)] border border-[var(--btn-border-hover)] flex items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all"
                  aria-label="Manage nodes"
                >
                  {gearIcon}
                </button>
              )}
              <UserMenu />
            </div>
          </div>

          <Navbar onManageNodes={onManageNodes} />
          {children}
        </div>
      </div>
    </AuthGate>
  );
}
