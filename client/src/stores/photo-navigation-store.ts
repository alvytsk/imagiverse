import { create } from 'zustand';

/** A single breadcrumb item for the photo detail page context trail. */
export type NavBreadcrumb =
  | { label: string; to: string; params?: Record<string, string> }
  | { label: string; to?: undefined };

interface PhotoNavigationState {
  /** Ordered list of photo IDs captured at the moment the user entered a detail page. */
  photoIds: string[];
  /** Identifies the source context (e.g. "feed:all", "feed:landscape", "album:{id}"). */
  sourceKey: string | null;
  /** Optional breadcrumb trail prepended before the photo item in the detail page. */
  contextBreadcrumbs: NavBreadcrumb[];
  /** Freeze the current navigation sequence. Call this before navigating to a detail page. */
  setNavigation: (photoIds: string[], sourceKey: string, contextBreadcrumbs?: NavBreadcrumb[]) => void;
}

/**
 * Session-stable photo navigation store.
 *
 * The list is written once when the user clicks a photo from the feed (or another list).
 * Likes, refetches, and feed reorderings do NOT update this list — navigation order is
 * intentionally frozen for the duration of the browse session.
 */
export const usePhotoNavigationStore = create<PhotoNavigationState>((set) => ({
  photoIds: [],
  sourceKey: null,
  contextBreadcrumbs: [],
  setNavigation: (photoIds, sourceKey, contextBreadcrumbs = []) =>
    set({ photoIds, sourceKey, contextBreadcrumbs }),
}));
