import { z } from 'zod';
export declare const UpdateProfileSchema: z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
    city: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    bio: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    displayName?: string | undefined;
    city?: string | null | undefined;
    bio?: string | null | undefined;
}, {
    displayName?: string | undefined;
    city?: string | null | undefined;
    bio?: string | null | undefined;
}>;
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
//# sourceMappingURL=users.d.ts.map