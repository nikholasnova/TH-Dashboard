import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  onManageNodes?: () => void;
}

export function PageLayout({ children, onManageNodes }: PageLayoutProps) {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          <Navbar onManageNodes={onManageNodes} />
          {children}
        </div>
      </div>
    </AuthGate>
  );
}

