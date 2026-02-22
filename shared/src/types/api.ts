// Standard API response shapes shared between frontend and backend

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
    details?: Array<{ field: string; message: string }>;
  };
}

// Photo statuses
export type PhotoStatus = 'processing' | 'ready' | 'failed' | 'deleted';

// User roles
export type UserRole = 'user' | 'admin';
