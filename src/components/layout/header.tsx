import Link from 'next/link';

export function Header() {
  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512" // Adjusted viewBox for meeple SVG
            fill="currentColor"
            className="h-8 w-8"
          >
            {/* Meeple SVG Path - Sourced from a generic meeple icon */}
            <path d="M256 0C181.3 0 120.4 60.91 120.4 135.6C120.4 159.1 126.7 181.9 137.7 201.7L37.22 273.7C14.03 290.5 0 318.8 0 349.1C0 403.1 41.69 448 93.41 448H159.6V512H352.4V448H418.6C470.3 448 512 403.1 512 349.1C512 318.8 497.1 290.5 474.8 273.7L374.3 201.7C385.3 181.9 391.6 159.1 391.6 135.6C391.6 60.91 330.7 0 256 0Z"/>
          </svg>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">BoardGame Ranker</h1>
        </Link>
        {/* Navigation items can be added here if needed */}
      </div>
    </header>
  );
}
