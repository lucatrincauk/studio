
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { List, LogOut, UserPlus, LogIn, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // Removed AvatarImage


export function Header() {
  const { user, signOut, loading } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    // router.push('/'); // Optional: redirect after sign out
  };

  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <BarChart3 className="h-8 w-8" /> {/* Changed icon */}
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Punteggiometro</h1>
        </Link>
        
        <nav>
          <ul className="flex items-center gap-4">
            <li>
              <Link 
                href="/collection" 
                className="flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent rounded-md px-2 py-1"
              >
                <List size={18} />
                Collection
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
                        {/* AvatarImage removed to always show fallback */}
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {user.email ? user.email.substring(0, 1).toUpperCase() : 'U'}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user.displayName || user.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {/* Add more items like "Profile", "Settings" here if needed */}
                    {/* <DropdownMenuItem asChild>
                      <Link href="/profile">Profile</Link>
                    </DropdownMenuItem> */}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign Out</span>
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
                      Sign In
                    </Link>
                  </Button>
                </li>
                <li>
                  <Button variant="default" asChild size="sm" className="text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary rounded-md">
                     <Link href="/signup">
                       <UserPlus size={16} className="mr-1.5"/>
                       Sign Up
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
