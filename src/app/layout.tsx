
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
  const defaultTheme = "forest-mist";
  // Ensure this list is exhaustive of all theme classes and matches ThemeProvider
  const validThemes = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];

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
  } catch (e) {
    console.warn('Could not access localStorage for theme preference.');
  }

  const docElClassList = document.documentElement.classList;
  // Remove ONLY THE THEME CLASSES, leave other classes like "h-full" intact
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
    <html lang="it" className="h-full" suppressHydrationWarning>
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
