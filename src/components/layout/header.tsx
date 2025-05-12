import Link from 'next/link';

export function Header() {
  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-8 w-8"
          >
            <path 
              fillRule="evenodd" 
              d="M10 2a2 2 0 100 4 2 2 0 000-4zM3.478 6.129A.75.75 0 003 6.75v5.5a.75.75 0 00.75.75h12.5a.75.75 0 00.75-.75v-5.5a.75.75 0 00-.478-.68l-2.577-1.196a.75.75 0 00-.944.24l-1.722 3.208a.75.75 0 01-1.362 0L7.72 5.203a.75.75 0 00-.944-.24L3.478 6.13zM3 13.5v2A1.5 1.5 0 004.5 17h2A1.5 1.5 0 008 15.5v-2h4v2A1.5 1.5 0 0013.5 17h2a1.5 1.5 0 001.5-1.5v-2H3z" 
              clipRule="evenodd" 
            />
          </svg>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">BoardGame Ranker</h1>
        </Link>
        {/* Navigation items can be added here if needed */}
      </div>
    </header>
  );
}
