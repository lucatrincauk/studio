
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
  const scriptDefaultTheme = "forest-mist";
  // Ensure this list is exhaustive of all theme classes and matches ThemeProvider
  const validThemes = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];

  const scriptContent = `
(function() {
  let themeToApply = '${scriptDefaultTheme}'; // Start with the script's default
  const docEl = document.documentElement;
  const localKey = '${storageKey}';
  const localThemes = ${JSON.stringify(validThemes)};
  const serverRenderedClass = '${SERVER_DEFAULT_THEME}';

  try {
    const storedTheme = window.localStorage.getItem(localKey);
    if (storedTheme && localThemes.includes(storedTheme)) {
      themeToApply = storedTheme; // Use stored theme if valid
    }
  } catch (e) {
    // console.warn('Could not access localStorage for theme preference.');
  }

  // If the theme to apply is different from what the server rendered, adjust.
  if (themeToApply !== serverRenderedClass) {
    docEl.classList.remove(serverRenderedClass);
    docEl.classList.add(themeToApply);
  }
  // Ensure no other theme classes linger and the correct one is applied
  // This is a fallback / cleanup if the initial server-rendered class was somehow wrong or multiple were present.
  localThemes.forEach(function(t) {
    if (t !== themeToApply) {
      docEl.classList.remove(t);
    }
  });
  // Final check to ensure the themeToApply is present if it wasn't the serverRenderedClass
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
