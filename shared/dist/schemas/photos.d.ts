import { z } from 'zod';
import type { PhotoStatus } from '../types/api';
export declare const UpdateCaptionSchema: z.ZodObject<{
    caption: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    caption?: string | null | undefined;
}, {
    caption?: string | null | undefined;
}>;
export type UpdateCaptionInput = z.infer<typeof UpdateCaptionSchema>;
export declare const PHOTO_VISIBILITY: readonly ["public", "private"];
export type PhotoVisibility = (typeof PHOTO_VISIBILITY)[number];
export interface PhotoThumbnails {
    small: string | null;
    medium: string | null;
    large: string | null;
}
export interface PhotoResponse {
    id: string;
    userId: string;
    caption: string | null;
    status: PhotoStatus;
    visibility: PhotoVisibility;
    thumbnails: PhotoThumbnails;
    blurhash: string | null;
    width: number | null;
    height: number | null;
    likeCount: number;
    commentCount: number;
    createdAt: string;
    updatedAt: string;
}
export declare const ALLOWED_MIME_TYPES: readonly ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export declare const MAX_FILE_SIZE_BYTES: number;
//# sourceMappingURL=photos.d.ts.map