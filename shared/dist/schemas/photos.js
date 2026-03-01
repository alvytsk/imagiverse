"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FILE_SIZE_BYTES = exports.ALLOWED_MIME_TYPES = exports.PHOTO_VISIBILITY = exports.UpdateVisibilitySchema = exports.UpdateCaptionSchema = void 0;
const zod_1 = require("zod");
exports.UpdateCaptionSchema = zod_1.z.object({
    caption: zod_1.z.string().max(2000, 'Caption must be at most 2000 characters').optional().nullable(),
});
exports.UpdateVisibilitySchema = zod_1.z.object({
    visibility: zod_1.z.enum(['public', 'private']),
});
exports.PHOTO_VISIBILITY = ['public', 'private'];
// Allowed MIME types for uploads
exports.ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
];
exports.MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
//# sourceMappingURL=photos.js.map