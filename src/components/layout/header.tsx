import Link from 'next/link';

export function Header() {
  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-8 w-8"
          >
            <path d="M18 6L4 20" /> {/* Main shaft of the needle, pointing bottom-left */}
            <circle cx="18.5" cy="5.5" r="1.2" stroke="currentColor" fill="none" /> {/* Eye of the needle, top-right */}
          </svg>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">BoardGame Ranker</h1>
        </Link>
        {/* Navigation items can be added here if needed */}
      </div>
    </header>
  );
}
