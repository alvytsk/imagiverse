import { useNavigate } from '@tanstack/react-router';
import { Camera, LogOut, Search, Shield, Upload, User } from 'lucide-react';
import { useCallback } from 'react';

import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TransitionLink } from '@/components/ui/transition-link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    await logout();
    navigate({ to: '/' });
  }, [logout, navigate]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-card/80 shadow-[0_1px_3px_0_oklch(0_0_0/0.06),0_4px_12px_0_oklch(0_0_0/0.04)] backdrop-blur-xl dark:shadow-[0_1px_3px_0_oklch(0_0_0/0.2),0_4px_12px_0_oklch(0_0_0/0.15)]">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4">
        <TransitionLink to="/" className="flex items-center gap-2 font-extrabold text-lg drop-shadow-[0_1px_2px_oklch(0_0_0/0.15)]">
          <Camera className="h-6 w-6 text-primary" />
          <span className="hidden sm:inline bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Imagiverse
          </span>
        </TransitionLink>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" asChild>
          <TransitionLink to="/search" search={{ q: '' }}>
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </TransitionLink>
        </Button>

        <ThemeToggle />

        {isAuthenticated ? (
          <>
            <Button variant="default" size="sm" asChild>
              <TransitionLink to="/upload" className="gap-2">
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">Upload</span>
              </TransitionLink>
            </Button>

            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-8 w-8 rounded-full"
                >
                  <Avatar className="h-8 w-8">
                    {user?.avatarUrl ? (
                      <AvatarImage
                        src={user.avatarUrl}
                        alt={user.displayName}
                      />
                    ) : null}
                    <AvatarFallback>
                      {user?.displayName?.charAt(0).toUpperCase() ?? 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.displayName}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      @{user?.username}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    navigate({ to: '/users/$userId', params: { userId: user!.id } })
                  }
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                {user?.role === 'admin' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => navigate({ to: '/admin' })}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <TransitionLink to="/login">Log in</TransitionLink>
            </Button>
            <Button size="sm" asChild>
              <TransitionLink to="/register">Sign up</TransitionLink>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
