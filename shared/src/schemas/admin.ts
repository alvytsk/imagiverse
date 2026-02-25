import { z } from 'zod';

// ── Report schemas ───────────────────────────────────────────────────────────

export const CreateReportSchema = z.object({
  reason: z
    .string()
    .min(1, 'Reason is required')
    .max(1000, 'Reason must be at most 1000 characters'),
});

export type CreateReportInput = z.infer<typeof CreateReportSchema>;

export const ResolveReportSchema = z.object({
  status: z.enum(['reviewed', 'dismissed']),
});

export type ResolveReportInput = z.infer<typeof ResolveReportSchema>;

export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface ReportResponse {
  id: string;
  photoId: string;
  reporterId: string;
  reporterUsername: string;
  reason: string;
  status: ReportStatus;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

// ── Admin user response ──────────────────────────────────────────────────────

export interface AdminUserResponse {
  id: string;
  email: string;
  username: string;
  displayName: string;
  city: string | null;
  role: string;
  bannedAt: string | null;
  photoCount: number;
  createdAt: string;
}

// ── Admin photo response ─────────────────────────────────────────────────────

export interface AdminPhotoResponse {
  id: string;
  userId: string;
  username: string;
  caption: string | null;
  status: string;
  reportCount: number;
  likeCount: number;
  commentCount: number;
  createdAt: string;
}

// ── Admin comment response ───────────────────────────────────────────────────

export interface AdminCommentResponse {
  id: string;
  photoId: string;
  userId: string;
  username: string;
  body: string;
  flagged: boolean;
  createdAt: string;
}

// ── Admin stats ──────────────────────────────────────────────────────────────

export interface AdminStatsResponse {
  totalUsers: number;
  totalPhotos: number;
  totalComments: number;
  pendingReports: number;
  flaggedComments: number;
  bannedUsers: number;
  failedPhotos: number;
}
