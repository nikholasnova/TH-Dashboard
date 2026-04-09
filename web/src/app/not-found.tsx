import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 text-center max-w-md">
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Page Not Found</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link href="/" className="btn-glass px-6 py-2 no-underline text-[var(--foreground)]">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
