import { ChevronRight, Home } from 'lucide-react';
import { Fragment } from 'react';

import { TransitionLink } from '@/components/ui/transition-link';
import { cn } from '@/lib/utils';

type BreadcrumbItem =
  | { label: string; to: string; params?: Record<string, string> }
  | { label: string; to?: undefined };

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Optional search params to attach to the Home (/) link — e.g. to restore a feed category. */
  homeSearch?: Record<string, string | undefined>;
  className?: string;
}

export function Breadcrumbs({ items, homeSearch, className }: BreadcrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('mb-6 flex items-center gap-1 text-sm text-muted-foreground', className)}
    >
      <TransitionLink
        to="/"
        search={homeSearch as never}
        className="flex items-center hover:text-foreground transition-colors"
        aria-label="Home"
      >
        <Home className="h-3.5 w-3.5" />
      </TransitionLink>

      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={item.label}>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {item.to && !isLast ? (
              <TransitionLink
                to={item.to as never}
                params={item.params as never}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </TransitionLink>
            ) : (
              <span
                className={cn(isLast && 'max-w-[220px] truncate text-foreground')}
                aria-current={isLast ? 'page' : undefined}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
