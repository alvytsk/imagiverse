import { z } from 'zod';
import type { PhotoStatus } from '../types/api';

export const UpdateCaptionSchema = z.object({
  caption: z.string().max(2000, 'Caption must be at most 2000 characters').optional().nullable(),
});

export type UpdateCaptionInput = z.infer<typeof UpdateCaptionSchema>;

export const UpdateVisibilitySchema = z.object({
  visibility: z.enum(['public', 'private']),
});

export type UpdateVisibilityInput = z.infer<typeof UpdateVisibilitySchema>;

export const PHOTO_VISIBILITY = ['public', 'private'] as const;
export type PhotoVisibility = (typeof PHOTO_VISIBILITY)[number];

export interface PhotoThumbnails {
  small: string | null; // 256px wide
  medium: string | null; // 800px wide
  large: string | null; // 1600px wide
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

// Allowed MIME types for uploads
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
