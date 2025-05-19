
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

const SERVER_DEFAULT_THEME = 'forest-mist'; 

const NoFlashScript = () => {
  const storageKey = "morchiometro-theme";
  const scriptDefaultTheme = SERVER_DEFAULT_THEME;
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

  localThemes.forEach(function(t) {
    docEl.classList.remove(t);
  });
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
              © {new Date().getFullYear()} Morchiometro.
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
