
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
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

const SERVER_DEFAULT_THEME = 'forest-mist'; // Define default theme for server rendering

const NoFlashScript = () => {
  const storageKey = "morchiometro-theme";
  // This defaultTheme in the script MUST match SERVER_DEFAULT_THEME and ThemeProvider's defaultTheme prop
  const scriptDefaultTheme = SERVER_DEFAULT_THEME;
  // Ensure this list is exhaustive of all theme classes and matches ThemeProvider
  const validThemes = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];

  const scriptContent = `
(function() {
  const docEl = document.documentElement;
  const localKey = '${storageKey}';
  const defaultThemeForScript = '${scriptDefaultTheme}';
  const localThemes = ${JSON.stringify(validThemes)};
  let themeToApply = defaultThemeForScript;

  try {
    const storedTheme = window.localStorage.getItem(localKey);
    if (storedTheme && localThemes.includes(storedTheme)) {
      themeToApply = storedTheme;
    }
  } catch (e) { /* ignore */ }

  // Remove all known theme classes first to ensure a clean state
  localThemes.forEach(function(t) {
    docEl.classList.remove(t);
  });
  // Add the chosen one
  docEl.classList.add(themeToApply);
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
            <Toaster />
            <footer className="py-6 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Morchiometro. Tutti i diritti riservati.
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
