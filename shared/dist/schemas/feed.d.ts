import type { PhotoThumbnails } from './photos';
export interface FeedItemResponse {
    id: string;
    userId: string;
    caption: string | null;
    thumbnails: PhotoThumbnails;
    width: number | null;
    height: number | null;
    likeCount: number;
    commentCount: number;
    score: number;
    createdAt: string;
    author: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
    };
}
//# sourceMappingURL=feed.d.ts.map