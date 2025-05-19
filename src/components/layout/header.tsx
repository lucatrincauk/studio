
'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { LogOut, UserPlus, LogIn, MessagesSquare, Users2, ShieldCheck, UserCircle, Menu, GaugeCircle, BarChart3 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const PoopEmojiLogo = () => (
  <span className="text-3xl" role="img" aria-label="logo">💩</span>
);

export function Header() {
  const { user, signOut, loading, isAdmin } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  const navLinks = (
    <>
      <SheetClose asChild>
        <Link
          href="/users"
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:bg-muted md:hover:bg-primary-foreground/10 md:text-primary-foreground rounded-md px-3 py-2"
        >
          <Users2 size={18} />
          Utenti
        </Link>
      </SheetClose>
      <SheetClose asChild>
        <Link
          href="/reviews"
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:bg-muted md:hover:bg-primary-foreground/10 md:text-primary-foreground rounded-md px-3 py-2"
        >
          <MessagesSquare size={18} />
          Tutte le Recensioni
        </Link>
      </SheetClose>
    </>
  );

  const authBlockDesktop = (
    loading ? (
      <div className="h-8 w-20 animate-pulse rounded-md bg-primary-foreground/20"></div>
    ) : user ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 hover:bg-primary-foreground/10 focus-visible:ring-accent">
            <Avatar className="h-9 w-9">
              {user.photoURL && <AvatarImage src={user.photoURL} alt={user.displayName || user.email || 'User Avatar'} />}
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
    ) : (
      <>
        <Button variant="ghost" asChild className="text-sm font-medium transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded-md px-3 py-1.5">
          <Link href="/signin">
            <LogIn size={16} className="mr-1.5"/>
            Accedi
          </Link>
        </Button>
        <Button variant="default" asChild size="sm" className="text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary rounded-md">
           <Link href="/signup">
             <UserPlus size={16} className="mr-1.5"/>
             Registrati
           </Link>
        </Button>
      </>
    )
  );
  
  const authBlockMobile = (
    loading ? (
      <div className="h-10 w-full animate-pulse rounded-md bg-muted my-2"></div>
    ) : user ? (
      <div className="flex flex-col space-y-2 px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <Avatar className="h-10 w-10">
            {user.photoURL && <AvatarImage src={user.photoURL} alt={user.displayName || user.email || 'User Avatar'} />}
            <AvatarFallback className="bg-accent text-accent-foreground">
              {user.displayName ? user.displayName.substring(0, 1).toUpperCase() : (user.email ? user.email.substring(0, 1).toUpperCase() : 'U')}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <p className="text-sm font-medium leading-none text-foreground">
              {user.displayName || user.email?.split('@')[0] || 'Utente'}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>
        <Separator />
        <SheetClose asChild>
          <Link href="/profile" className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start gap-2")}>
            <UserCircle className="h-4 w-4" />
            Mio Profilo
          </Link>
        </SheetClose>
        {isAdmin && (
          <SheetClose asChild>
            <Link href="/admin" className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start gap-2")}>
              <ShieldCheck className="h-4 w-4" />
              Sezione Admin
            </Link>
          </SheetClose>
        )}
         <Separator />
        <Button variant="ghost" onClick={() => { handleSignOut(); }} className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4" />
          Esci
        </Button>
      </div>
    ) : (
      <>
        <SheetClose asChild>
          <Link
            href="/signin"
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'w-full justify-start text-sm font-medium text-foreground gap-2'
            )}
          >
            <LogIn size={16} />
            Accedi
          </Link>
        </SheetClose>
        <SheetClose asChild>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ variant: 'default' }),
              'w-full text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 gap-2'
            )}
          >
            <UserPlus size={16} />
            Registrati
          </Link>
        </SheetClose>
      </>
    )
  );


  return (
    <header className="bg-primary text-primary-foreground sticky top-0 z-50 shadow-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <PoopEmojiLogo />
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Morchiometro</h1>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          <ul className="flex items-center gap-1 sm:gap-2">
            {/* Desktop navLinks are simpler, no SheetClose needed */}
            <Link
              href="/users"
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:bg-primary-foreground/10 text-primary-foreground rounded-md px-3 py-1.5"
            >
              <Users2 size={18} />
              Utenti
            </Link>
            <Link
              href="/reviews"
              className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:bg-primary-foreground/10 text-primary-foreground rounded-md px-3 py-1.5"
            >
              <MessagesSquare size={18} />
              Tutte le Recensioni
            </Link>
          </ul>
          <div className="ml-2 flex items-center gap-1 sm:gap-2">
            {authBlockDesktop}
          </div>
        </nav>

        {/* Mobile Navigation */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-primary-foreground/10 focus-visible:ring-accent">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Apri menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-card p-0 text-card-foreground">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="text-left">
                  <SheetClose asChild>
                    <Link href="/" className="flex items-center gap-2 text-primary transition-opacity hover:opacity-80">
                      <PoopEmojiLogo />
                      <span className="text-lg font-bold">Morchiometro</span>
                    </Link>
                  </SheetClose>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col space-y-1 p-4">
                {navLinks} 
              </nav>
              <Separator className="my-2"/>
              <div className="flex flex-col space-y-2 p-4">
                 {authBlockMobile}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
