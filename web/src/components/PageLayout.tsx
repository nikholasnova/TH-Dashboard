import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';

interface PageLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function PageLayout({ title, subtitle, children }: PageLayoutProps) {
  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          <div className="flex flex-col-reverse sm:flex-col">
            <header className="mb-6 sm:mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">{title}</h1>
              <p className="text-base sm:text-lg text-[#a0aec0]">{subtitle}</p>
            </header>
            <Navbar />
          </div>
          {children}
        </div>
      </div>
    </AuthGate>
  );
}

