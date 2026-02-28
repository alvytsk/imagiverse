import { Link, useRouter } from '@tanstack/react-router';
import type { ComponentProps, MouseEvent } from 'react';
import { flushSync } from 'react-dom';

type LinkProps = ComponentProps<typeof Link>;

/**
 * A wrapper around TanStack Router's `Link` that triggers the View Transitions
 * API for smooth page transitions. Falls back to normal navigation on browsers
 * that don't support `document.startViewTransition`.
 */
export function TransitionLink(props: LinkProps) {
  const router = useRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Call original onClick if provided
    props.onClick?.(e as never);
    if (e.defaultPrevented) return;

    // Only intercept left-click without modifier keys
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // Feature detect View Transitions API
    if (!document.startViewTransition) return;

    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    e.preventDefault();
    document.startViewTransition(() => {
      flushSync(() => {
        router.navigate({
          to: props.to,
          params: props.params as never,
          search: props.search as never,
        });
      });
    });
  };

  return <Link {...props} onClick={handleClick} />;
}
