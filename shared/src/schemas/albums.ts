import { z } from 'zod';

export const CreateAlbumSchema = z.object({
  name: z
    .string()
    .min(1, 'Album name is required')
    .max(100, 'Album name must be at most 100 characters'),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
});

export type CreateAlbumInput = z.infer<typeof CreateAlbumSchema>;

export const UpdateAlbumSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
});

export type UpdateAlbumInput = z.infer<typeof UpdateAlbumSchema>;

export const AlbumAddPhotoSchema = z.object({
  photoId: z.string().uuid('Invalid photo ID'),
});

export type AlbumAddPhotoInput = z.infer<typeof AlbumAddPhotoSchema>;

export interface AlbumResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  photoCount: number;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
