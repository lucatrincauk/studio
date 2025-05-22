
'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { LogOut, UserPlus, LogIn, MessagesSquare, Users2, ShieldCheck, UserCircle, Menu, TrendingUp, Library, Edit, Dices, Search as SearchIcon, Loader2, Settings, ExternalLink, Heart, ListPlus, ListChecks, Pin, PinOff, Clock, BarChart3, LayoutList, Bookmark, BookMarked, GaugeCircle } from 'lucide-react';
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
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { BoardGame } from '@/lib/types';
import { searchLocalGamesByNameAction } from '@/lib/actions';
import { useRouter } from 'next/navigation';


function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const PoopEmojiLogo = () => (
  <span role="img" aria-label="Morchiometro Logo" className="text-3xl md:text-4xl leading-none">
    💩
  </span>
);


export function Header() {
  const { user, signOut, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Pick<BoardGame, 'id' | 'name' | 'yearPublished'>[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [isDesktopPopoverOpen, setIsDesktopPopoverOpen] = useState(false);
  const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);


  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const desktopSearchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);


  const handleSignOut = async () => {
    await signOut();
    setIsMobileSheetOpen(false); 
  };

  const mainNavLinks = [
    { href: "/top-10", label: "Top 10", icon: <TrendingUp size={18} /> },
    { href: "/all-games", label: "Catalogo", icon: <Library size={18} /> },
    { href: "/users", label: "Utenti", icon: <Users2 size={18} /> },
    { href: "/reviews", label: "Voti", icon: <MessagesSquare size={18} /> },
    { href: "/plays", label: "Partite", icon: <Dices size={18} /> },
  ];

  const performSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      if (desktopSearchInputRef.current === document.activeElement) setIsDesktopPopoverOpen(false);
      if (mobileSearchInputRef.current === document.activeElement && isMobileSheetOpen) setIsMobilePopoverOpen(false);
      return;
    }
    setIsSearching(true);
    const result = await searchLocalGamesByNameAction(term);
    setIsSearching(false);

    if ('error' in result) {
      setSearchResults([]);
      console.error("Search error:", result.error);
      if (desktopSearchInputRef.current === document.activeElement && !isMobileSheetOpen) setIsDesktopPopoverOpen(term.length >= 2);
      if (mobileSearchInputRef.current === document.activeElement && isMobileSheetOpen) setIsMobilePopoverOpen(term.length >= 2);

    } else {
      setSearchResults(result);
      const hasResults = result.length > 0;
      if (desktopSearchInputRef.current === document.activeElement && !isMobileSheetOpen) {
        setIsDesktopPopoverOpen(hasResults || term.length >=2);
      }
      if (mobileSearchInputRef.current === document.activeElement && isMobileSheetOpen) {
        setIsMobilePopoverOpen(hasResults || term.length >=2);
      }
    }
  }, [isMobileSheetOpen]);


  useEffect(() => {
    performSearch(debouncedSearchTerm);
  }, [debouncedSearchTerm, performSearch]);

  const handleResultClick = () => {
    setSearchTerm('');
    setSearchResults([]);
    setIsDesktopPopoverOpen(false);
    setIsMobilePopoverOpen(false);
    // SheetClose will handle closing the sheet on mobile
  };
  
  const authBlock = (
    authLoading || !isMounted ? ( 
      <div className="h-9 w-20 animate-pulse rounded-md bg-primary-foreground/20"></div>
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
            <Link href={`/users/${user.uid}`}>
              <UserCircle className="mr-2 h-4 w-4" />
              Il Mio Profilo Pubblico
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href="/profile">
              <Settings className="mr-2 h-4 w-4" />
              Impostazioni Account
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            <span>Esci</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <div className="flex items-center gap-1">
        <Link
          href="/signin"
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'sm' }),
            "text-sm font-medium transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-accent rounded-md",
            "px-2 py-1.5" 
          )}
        >
            <LogIn size={16} className="sm:mr-1.5"/>
            <span className="hidden sm:inline">Accedi</span>
        </Link>
        <Link
           href="/signup"
           className={cn(
             buttonVariants({ variant: 'default', size: 'sm' }),
             "text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-primary rounded-md hidden sm:flex"
            )}
         >
             <UserPlus size={16} className="mr-1.5"/>
             Registrati
        </Link>
      </div>
    )
  );
  
  const desktopSearchPopoverContent = (
    <PopoverContent
      className="w-[300px] p-0"
      align="end"
      onOpenAutoFocus={(e) => e.preventDefault()} 
      onInteractOutside={(e) => {
        if (desktopSearchInputRef.current && !desktopSearchInputRef.current.contains(e.target as Node)) {
          setIsDesktopPopoverOpen(false);
        }
      }}
    >
      <div className="max-h-60 overflow-y-auto">
        {searchResults.length > 0 ? searchResults.map(game => (
          <Link
            key={`desktop-search-${game.id}`}
            href={`/games/${game.id}`}
            onClick={handleResultClick}
            className="block px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {game.name}
            {game.yearPublished && <span className="ml-2 text-xs text-muted-foreground">({game.yearPublished})</span>}
          </Link>
        )) : (
          <p className="p-3 text-sm text-muted-foreground text-center">Nessun gioco trovato.</p>
        )}
      </div>
    </PopoverContent>
  );

  const mobileSearchPopoverContent = (
    <PopoverContent
      className="w-[248px] p-0" 
      align="start"
      side="bottom"
      sideOffset={4}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onInteractOutside={(e) => {
         if (mobileSearchInputRef.current && !mobileSearchInputRef.current.contains(e.target as Node)) {
            setIsMobilePopoverOpen(false);
        }
      }}
    >
      <div className="max-h-60 overflow-y-auto">
         {searchResults.length > 0 ? searchResults.map(game => (
          <SheetClose asChild key={`mobile-search-${game.id}`}>
            <Link
              href={`/games/${game.id}`}
              onClick={handleResultClick}
              className="block px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {game.name}
              {game.yearPublished && <span className="ml-2 text-xs text-muted-foreground">({game.yearPublished})</span>}
            </Link>
          </SheetClose>
        )) : (
          <p className="p-3 text-sm text-muted-foreground text-center">Nessun gioco trovato.</p>
        )}
      </div>
    </PopoverContent>
  );


  return (
    <div className="sticky top-0 z-50 w-full">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
            <PoopEmojiLogo />
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Morchiometro</h1>
          </Link>
          
          {/* Desktop Navigation and Right-Side Controls */}
          <div className="hidden md:flex flex-1 items-center justify-end">
            {/* Desktop Search */}
            <div className="relative"> 
              <Popover 
                open={isDesktopPopoverOpen && searchTerm.length >=2 && (isSearching || searchResults.length > 0)}
                onOpenChange={(openState) => {
                    if (!openState && desktopSearchInputRef.current !== document.activeElement) {
                        setIsDesktopPopoverOpen(false);
                    } else if (openState && searchTerm.length >= 2 && searchResults.length > 0) {
                        setIsDesktopPopoverOpen(true);
                    }
                }}
              >
                <PopoverAnchor>
                  <div className="relative flex items-center">
                    <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-border pointer-events-none" />
                    <Input
                      ref={desktopSearchInputRef}
                      type="search"
                      placeholder="Cerca un gioco..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onFocus={() => {
                        if (searchTerm.length >=2 && !isMobileSheetOpen) {
                            setIsDesktopPopoverOpen(true);
                        }
                      }}
                      className="h-8 w-48 lg:w-64 rounded-md pl-9 pr-3 text-sm bg-primary-foreground/10 text-border placeholder:text-border/60 border-border focus:bg-primary-foreground/20 focus:ring-accent"
                    />
                    {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-border" />}
                  </div>
                </PopoverAnchor>
                {isMounted && desktopSearchPopoverContent}
              </Popover>
            </div>
            
            {/* Desktop Auth Controls */}
            <div className="ml-3">
              {isMounted && authBlock}
            </div>
          </div>
            
          {/* Mobile Menu Trigger - Only visible on mobile */}
          <div className="flex items-center md:hidden">
             {isMounted && authBlock} {/* Auth block for mobile, styled by its internal responsive classes */}
            <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-1 w-9 h-9 p-0 hover:bg-primary-foreground/10 focus-visible:ring-accent">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Apri menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] bg-card p-0 text-card-foreground flex flex-col">
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
                
                <div className="p-4">
                  <Popover 
                    open={isMobilePopoverOpen && searchTerm.length >=2 && isMobileSheetOpen && (isSearching || searchResults.length > 0)} 
                    onOpenChange={(openState) => {
                      if (!openState && mobileSearchInputRef.current !== document.activeElement) {
                          setIsMobilePopoverOpen(false);
                      } else if (openState && searchTerm.length >= 2 && searchResults.length > 0 && isMobileSheetOpen) {
                          setIsMobilePopoverOpen(true);
                      }
                    }}
                  >
                    <PopoverAnchor>
                        <div className="relative flex items-center">
                          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            ref={mobileSearchInputRef}
                            type="search"
                            placeholder="Cerca un gioco..."
                            value={searchTerm}
                            onChange={(e) => {
                              setSearchTerm(e.target.value);
                            }}
                            onFocus={() => {
                              if (searchTerm.length >=2 && isMobileSheetOpen) {
                                  setIsMobilePopoverOpen(true);
                              }
                            }}
                            className="h-9 w-full rounded-md pl-9 pr-3 text-sm bg-background text-foreground border-input focus:ring-primary/50"
                          />
                          {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                        </div>
                      </PopoverAnchor>
                      {isMounted && mobileSearchPopoverContent}
                  </Popover>
                </div>

                <nav className="flex-1 flex flex-col space-y-1 p-4 pt-0 overflow-y-auto">
                  {mainNavLinks.map(link => (
                    <SheetClose asChild key={`mobile-nav-${link.href}`}>
                        <Link
                          href={link.href}
                          className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start gap-2 text-sm font-medium text-foreground rounded-md px-3 py-2")}
                        >
                          {link.icon}
                          {link.label}
                        </Link>
                      </SheetClose>
                  ))}
                </nav>
                {/* Mobile Auth controls were moved outside the sheet, handled by the responsive main authBlock */}
              </SheetContent>
            </Sheet>
          </div> 
        </div>
      </header>

      {/* Sub-navbar (Desktop only) */}
      <nav className="hidden md:flex bg-muted border-b border-border">
        <div className="container mx-auto flex h-12 items-center justify-center px-4 sm:px-6 lg:px-8 relative">
          <ul className="flex items-center gap-4 lg:gap-6">
            {mainNavLinks.map(link => (
              <li key={`desktop-subnav-${link.href}`}>
                <Link
                  href={link.href}
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary px-3 py-2 rounded-md"
                >
                  {link.icon}
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
