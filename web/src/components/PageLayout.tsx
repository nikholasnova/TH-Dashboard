import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          <Navbar />
          {children}
        </div>
      </div>
    </AuthGate>
  );
}

