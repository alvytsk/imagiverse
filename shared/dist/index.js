"use strict";
// Shared types and Zod schemas used by both client and server.
// Import from 'imagiverse-shared' in both workspaces.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./schemas/admin"), exports);
__exportStar(require("./schemas/auth"), exports);
__exportStar(require("./schemas/comments"), exports);
__exportStar(require("./schemas/feed"), exports);
__exportStar(require("./schemas/likes"), exports);
__exportStar(require("./schemas/notifications"), exports);
__exportStar(require("./schemas/photos"), exports);
__exportStar(require("./schemas/users"), exports);
__exportStar(require("./types/api"), exports);
//# sourceMappingURL=index.js.map