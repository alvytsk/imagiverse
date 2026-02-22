"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProfileSchema = void 0;
const zod_1 = require("zod");
exports.UpdateProfileSchema = zod_1.z.object({
    displayName: zod_1.z.string().min(1).max(64).optional(),
    city: zod_1.z.string().max(64).optional().nullable(),
    bio: zod_1.z.string().max(500).optional().nullable(),
});
//# sourceMappingURL=users.js.map