"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    username: zod_1.z
        .string()
        .min(3, 'Username must be at least 3 characters')
        .max(32, 'Username must be at most 32 characters')
        .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'),
    displayName: zod_1.z
        .string()
        .min(1, 'Display name is required')
        .max(64, 'Display name must be at most 64 characters'),
    password: zod_1.z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be at most 128 characters'),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
//# sourceMappingURL=auth.js.map