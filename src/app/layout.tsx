
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { ClientOnlyToaster } from '@/components/layout/client-only-toaster';
import { Header } from '@/components/layout/header';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Morchiometro',
  description: 'Valuta e recensisci i tuoi giochi da tavolo preferiti.',
};

const SERVER_DEFAULT_THEME = 'forest-mist';
const VALID_THEMES: Readonly<string[]> = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];

const NoFlashScript = () => {
  const storageKey = "morchiometro-theme";
  // This script runs before React hydrates. It sets the theme class on <html>
  // based on localStorage or OS preference to prevent a theme flash.
  const scriptContent = `
(function() {
  const docEl = document.documentElement;
  const localKey = '${storageKey}';
  const scriptDefaultTheme = '${SERVER_DEFAULT_THEME}';
  const scriptValidThemes = ${JSON.stringify(VALID_THEMES)};
  let themeToApply = scriptDefaultTheme; // Start with the server-rendered/app default

  try {
    const storedTheme = window.localStorage.getItem(localKey);
    if (storedTheme && scriptValidThemes.includes(storedTheme)) {
      themeToApply = storedTheme; // Use localStorage theme if valid
    } else {
      // No valid theme in localStorage, check OS preference
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (scriptValidThemes.includes('forest-mist-dark')) {
          themeToApply = 'forest-mist-dark';
        }
      } else {
        if (scriptValidThemes.includes('forest-mist')) {
           themeToApply = 'forest-mist'; // Default to light version of forest-mist if OS is light
        }
      }
    }
  } catch (e) { /* ignore localStorage errors */ }

  // Remove all known theme classes first to ensure a clean state
  scriptValidThemes.forEach(function(t) {
    if (docEl.classList.contains(t)) {
      docEl.classList.remove(t);
    }
  });
  // Add the chosen one
  if (!docEl.classList.contains(themeToApply)) {
    docEl.classList.add(themeToApply);
  }
})();
  `;
  return <script dangerouslySetInnerHTML={{ __html: scriptContent }} />;
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`h-full ${SERVER_DEFAULT_THEME}`} suppressHydrationWarning>
      <head>
        <NoFlashScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen bg-background`}>
        <ThemeProvider defaultTheme={SERVER_DEFAULT_THEME} storageKey="morchiometro-theme">
          <AuthProvider>
            <Header />
            <main className="flex-grow container mx-auto px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </main>
            <ClientOnlyToaster />
            <footer className="py-6 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Morchiometro.
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

