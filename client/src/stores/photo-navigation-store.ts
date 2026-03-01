import { create } from 'zustand';

interface PhotoNavigationState {
  /** Ordered list of photo IDs captured at the moment the user entered a detail page. */
  photoIds: string[];
  /** Identifies the source context (e.g. "feed:all", "feed:landscape") to detect stale lists. */
  sourceKey: string | null;
  /** Freeze the current navigation sequence. Call this before navigating to a detail page. */
  setNavigation: (photoIds: string[], sourceKey: string) => void;
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
  setNavigation: (photoIds, sourceKey) => set({ photoIds, sourceKey }),
}));
