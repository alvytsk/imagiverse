import { useNavigate, useSearch } from '@tanstack/react-router';
import type { PublicUser } from 'imagiverse-shared';
import { MapPin, Search, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TransitionLink } from '@/components/ui/transition-link';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchUsers } from '@/hooks/use-users';

export function SearchPage() {
  const { q } = useSearch({ from: '/search' }) as { q: string };
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(q || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useSearchUsers(q || '');

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        navigate({
          to: '/search',
          search: { q: value },
          replace: true,
        });
      }, 300);
    },
    [navigate],
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const users = data?.data ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder="Search users by name, username, or city..."
          className="pl-11 h-12 text-lg rounded-2xl border-transparent bg-muted/50 focus-visible:bg-background focus-visible:shadow-lg"
        />
      </div>

      {!q || q.length < 2 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-semibold">Search for users</p>
          <p className="text-muted-foreground">
            Type at least 2 characters to search
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl bg-card p-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-8">
          <p className="text-destructive">Search failed. Please try again.</p>
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-semibold">No users found</p>
          <p className="text-muted-foreground">
            Try different search terms
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserCard({ user }: { user: PublicUser }) {
  return (
    <TransitionLink
      to="/users/$userId"
      params={{ userId: user.id }}
      className="flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 hover:bg-accent hover:-translate-y-0.5 hover:shadow-md"
    >
      <Avatar className="h-12 w-12" style={{ viewTransitionName: `avatar-${user.id}` }}>
        {user.avatarUrl ? (
          <AvatarImage src={user.avatarUrl} alt={user.displayName} />
        ) : null}
        <AvatarFallback>
          {user.displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{user.displayName}</p>
        <p className="text-sm text-muted-foreground truncate">
          @{user.username}
        </p>
        {user.city && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <MapPin className="h-3 w-3" />
            {user.city}
          </p>
        )}
      </div>
      <span className="text-sm text-muted-foreground">
        {user.photoCount} photos
      </span>
    </TransitionLink>
  );
}
