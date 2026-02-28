import type { ExifSummary, PhotoCategorySummary, PhotoThumbnails } from './photos';
export interface FeedItemResponse {
    id: string;
    userId: string;
    caption: string | null;
    thumbnails: PhotoThumbnails;
    blurhash: string | null;
    width: number | null;
    height: number | null;
    likeCount: number;
    commentCount: number;
    likedByMe: boolean;
    exifSummary: ExifSummary | null;
    category: PhotoCategorySummary | null;
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