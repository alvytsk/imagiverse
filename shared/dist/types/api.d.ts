export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}
export interface ApiError {
    error: {
        code: string;
        message: string;
        details?: Array<{
            field: string;
            message: string;
        }>;
    };
}
export type PhotoStatus = 'processing' | 'ready' | 'failed' | 'deleted';
export type UserRole = 'user' | 'admin';
//# sourceMappingURL=api.d.ts.map