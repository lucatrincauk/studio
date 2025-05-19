
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
// import { Toaster } from "@/components/ui/toaster"; // Remove direct import
import { ClientOnlyToaster } from '@/components/layout/client-only-toaster'; // Import new wrapper
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
  // Ensure this list matches the themes defined in globals.css and ThemeContext
  const validThemes = ['light', 'dark', 'violet-dream', 'energetic-coral', 'forest-mist'];

  const scriptContent = `
(function() {
  const docEl = document.documentElement;
  const localKey = '${storageKey}';
  let themeToApply = '${scriptDefaultTheme}'; // Default to server-rendered theme
  const localThemes = ${JSON.stringify(validThemes)};

  try {
    const storedTheme = window.localStorage.getItem(localKey);
    if (storedTheme && localThemes.includes(storedTheme)) {
      themeToApply = storedTheme;
    }
  } catch (e) { /* ignore */ }

  // Remove all known theme classes first to ensure a clean state
  localThemes.forEach(function(t) {
    if (docEl.classList.contains(t)) { // Check before removing
        docEl.classList.remove(t);
    }
  });
  // Add the chosen one
  if (!docEl.classList.contains(themeToApply)) { // Check before adding
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
            <ClientOnlyToaster /> {/* Use the client-side wrapper */}
            <footer className="py-6 text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} Morchiometro.
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
