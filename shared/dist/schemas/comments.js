"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateCommentSchema = void 0;
const zod_1 = require("zod");
exports.CreateCommentSchema = zod_1.z.object({
    body: zod_1.z
        .string()
        .min(1, 'Comment body is required')
        .max(2000, 'Comment must be at most 2000 characters'),
    parentId: zod_1.z.string().uuid().optional(),
});
//# sourceMappingURL=comments.js.map