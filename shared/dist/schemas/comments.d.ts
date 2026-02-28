import { z } from 'zod';
export declare const CreateCommentSchema: z.ZodObject<
  {
    body: z.ZodString;
    parentId: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    body: string;
    parentId?: string | undefined;
  },
  {
    body: string;
    parentId?: string | undefined;
  }
>;
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
export interface CommentResponse {
  id: string;
  photoId: string;
  userId: string;
  username: string;
  displayName: string;
  body: string;
  parentId: string | null;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}
//# sourceMappingURL=comments.d.ts.map
