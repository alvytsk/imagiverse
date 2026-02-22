import { z } from 'zod';
export declare const RegisterSchema: z.ZodObject<{
    email: z.ZodString;
    username: z.ZodString;
    displayName: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    username: string;
    displayName: string;
    password: string;
}, {
    email: string;
    username: string;
    displayName: string;
    password: string;
}>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export interface AuthTokens {
    accessToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
}
//# sourceMappingURL=auth.d.ts.map