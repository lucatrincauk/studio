
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LogOut, UserPlus, LogIn, MessagesSquare, Users2, ShieldCheck, UserCircle } from 'lucide-react'; // Removed BarChart3
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AvatarImage } from '@radix-ui/react-avatar';

// New Inline SVG Logo Component
const MorchiometroLogo = () => (
  <svg 
    width="32" 
    height="32" 
    viewBox="0 0 100 95" // Adjusted viewBox height to accommodate emoji
    fill="none" 
    xmlns="http://www.w3.org/2000/svg" 
    aria-label="Morchiometro Logo"
  >
    {/* Gauge Border Arc */}
    <path d="M15 65 A 35 35 0 0 1 85 65" stroke="#4A0072" strokeWidth="8" fill="none" />
    {/* Green Segment */}
    <path d="M18.53 62.47 A 31.5 31.5 0 0 1 37.75 38.02" stroke="#6AAE55" strokeWidth="7" fill="none" />
    {/* Yellow Segment */}
    <path d="M37.75 38.02 A 31.5 31.5 0 0 1 62.25 38.02" stroke="#FAA61A" strokeWidth="7" fill="none" />
    {/* Red Segment */}
    <path d="M62.25 38.02 A 31.5 31.5 0 0 1 81.47 62.47" stroke="#E24E42" strokeWidth="7" fill="none" />
    {/* Needle Pivot */}
    <circle cx="50" cy="65" r="3.5" fill="#30104A" />
    {/* Needle pointing to red */}
    <line x1="50" y1="65" x2="75" y2="43" stroke="#30104A" strokeWidth="3.5" strokeLinecap="round" />
    
    {/* Simplified Poop Emoji */}
    {/* Base part of the poop */}
    <path 
      d="M38 88 C35 88 32 83 35 78 C38 73 42 72 50 72 C58 72 62 73 65 78 C68 83 65 88 62 88 Z" 
      fill="#6A0DAD" 
      stroke="#4A0072" 
      strokeWidth="2" 
    />
    {/* Middle part of the poop */}
    <ellipse cx="50" cy="75" rx="12" ry="8" fill="#6A0DAD" stroke="#4A0072" strokeWidth="2"/>
    {/* Top swirl of the poop */}
    <ellipse cx="50" cy="68" rx="7" ry="5" fill="#6A0DAD" stroke="#4A0072" strokeWidth="2"/>
    
    {/* Eyes */}
    <circle cx="45" cy="80" r="2.5" fill="#30104A" />
    <circle cx="55" cy="80" r="2.5" fill="#30104A" />
    {/* Sad Mouth */}
    <path d="M47 85 Q50 83 53 85" stroke="#30104A" strokeWidth="2" fill="none" strokeLinecap="round"/>
  </svg>
);


export function Header() {
  const { user, signOut, loading, isAdmin } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    // router.push('/'); // Optional: redirect after sign out
  };

  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <MorchiometroLogo /> {/* Replaced BarChart3 with new SVG logo */}
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Morchiometro</h1>
        </Link>

        <nav>
          <ul className="flex items-center gap-2 sm:gap-4">
             <li>
              <Link
                href="/users"
                className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent rounded-md px-2 py-1"
              >
                <Users2 size={18} />
                Utenti
              </Link>
            </li>
            <li>
              <Link
                href="/reviews"
                className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent rounded-md px-2 py-1"
              >
                <MessagesSquare size={18} />
                Tutte le Recensioni
              </Link>
            </li>
            {loading ? (
              <div className="h-8 w-20 animate-pulse rounded-md bg-primary-foreground/20"></div>
            ) : user ? (
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 hover:bg-primary-foreground/10 focus-visible:ring-accent">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || user.email || 'User Avatar'} />
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {user.displayName ? user.displayName.substring(0, 1).toUpperCase() : (user.email ? user.email.substring(0, 1).toUpperCase() : 'U')}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.displayName || user.email?.split('@')[0] || 'Utente'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link href="/profile">
                        <UserCircle className="mr-2 h-4 w-4" />
                        Mio Profilo
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href="/admin">
                          <ShieldCheck className="mr-2 h-4 w-4" />
                          Sezione Admin
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Esci</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ) : (
              <>
                <li>
                  <Button variant="ghost" asChild className="text-sm font-medium transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded-md px-3 py-1.5">
                    <Link href="/signin">
                      <LogIn size={16} className="mr-1.5"/>
                      Accedi
                    </Link>
                  </Button>
                </li>
                <li>
                  <Button variant="default" asChild size="sm" className="text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary rounded-md">
                     <Link href="/signup">
                       <UserPlus size={16} className="mr-1.5"/>
                       Registrati
                     </Link>
                  </Button>
                </li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
