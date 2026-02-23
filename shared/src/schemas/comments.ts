import { z } from 'zod';

export const CreateCommentSchema = z.object({
  body: z
    .string()
    .min(1, 'Comment body is required')
    .max(2000, 'Comment must be at most 2000 characters'),
});

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export interface CommentResponse {
  id: string;
  photoId: string;
  userId: string;
  username: string;
  displayName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}
