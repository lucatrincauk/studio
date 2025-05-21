
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
  description: 'Valuta e dai un voto ai tuoi giochi da tavolo preferiti.',
};

const SERVER_DEFAULT_THEME = 'forest-mist';
const VALID_THEMES_FOR_SCRIPT: Readonly<string[]> = ['violet-dream', 'energetic-coral', 'forest-mist', 'forest-mist-dark'];

const NoFlashScript = () => {
  const storageKey = "morchiometro-theme";
  const autoThemeKey = "morchiometro-auto-theme-enabled";
  const defaultThemeForScript = SERVER_DEFAULT_THEME; 
  const scriptValidThemes = VALID_THEMES_FOR_SCRIPT;

  const scriptContent = `
(function() {
  const docEl = document.documentElement;
  const localKey = '${storageKey}';
  const localAutoKey = '${autoThemeKey}';
  const scriptDefaultTheme = '${defaultThemeForScript}';
  const scriptValidThemes = ${JSON.stringify(scriptValidThemes)};
  let themeToApply = scriptDefaultTheme;

  try {
    const storedAutoThemeEnabled = window.localStorage.getItem(localAutoKey);
    const isAutoEnabled = storedAutoThemeEnabled !== 'false'; 
    const storedTheme = window.localStorage.getItem(localKey);

    if (storedTheme && scriptValidThemes.includes(storedTheme)) {
      themeToApply = storedTheme; 
    } else if (isAutoEnabled) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        if (scriptValidThemes.includes('forest-mist-dark')) {
          themeToApply = 'forest-mist-dark';
        } else {
           themeToApply = scriptDefaultTheme; 
        }
      } else {
        themeToApply = scriptDefaultTheme; 
      }
    }
  } catch (e) { /* ignore localStorage errors */ }

  const allPossibleThemes = ['light', 'dark', ...scriptValidThemes, scriptDefaultTheme]; // Include old defaults just in case
  allPossibleThemes.forEach(function(t) {
    if (docEl.classList.contains(t)) {
      docEl.classList.remove(t);
    }
  });
  
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
            <main className="flex-grow container mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
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
