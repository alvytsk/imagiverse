import { z } from 'zod';

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(64).optional(),
  city: z.string().max(64).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  city: string | null;
  avatarUrl: string | null;
  bio: string | null;
  photoCount: number;
  createdAt: string;
}

export interface MeProfileResponse {
  id: string;
  email: string;
  username: string;
  displayName: string;
  city: string | null;
  avatarUrl: string | null;
  bio: string | null;
  role: string;
  photoCount: number;
  createdAt: string;
}
