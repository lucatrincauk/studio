
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

const NoFlashScript = () => {
  const storageKey = "morchiometro-theme";
  const defaultTheme = "forest-mist"; // This is the key default
  // Ensure this list is exhaustive of all theme classes you might have used or will use
  const validThemes = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];

  // This script runs prioritized in the <head> to set the theme ASAP
  const scriptContent = `
(function() {
  let themeToApply = '${defaultTheme}'; // Start with the default
  const localKey = '${storageKey}';
  const localThemes = ${JSON.stringify(validThemes)};
  try {
    const storedTheme = window.localStorage.getItem(localKey);
    if (storedTheme && localThemes.includes(storedTheme)) {
      themeToApply = storedTheme; // Use stored theme if valid
    }
    // If no valid theme in localStorage, themeToApply remains defaultTheme
  } catch (e) {
    // If localStorage access fails, themeToApply remains defaultTheme
    console.warn('Could not access localStorage for theme preference.');
  }

  const docElClassList = document.documentElement.classList;
  // Remove all known theme classes first to avoid conflicts
  localThemes.forEach(function(t) { docElClassList.remove(t); });
  // Add the determined theme class
  docElClassList.add(themeToApply);
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
    <html lang="it" className="h-full">
      <head>
        <NoFlashScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen bg-background`}>
        <ThemeProvider defaultTheme="forest-mist" storageKey="morchiometro-theme">
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
