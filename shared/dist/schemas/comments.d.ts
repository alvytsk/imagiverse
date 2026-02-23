import { z } from 'zod';
export declare const CreateCommentSchema: z.ZodObject<{
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
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
//# sourceMappingURL=comments.d.ts.map