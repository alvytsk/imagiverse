export interface AdminUsersQuery {
  status?: 'all' | 'active' | 'banned';
  cursor?: string;
  limit?: string;
}

export interface AdminPhotosQuery {
  status?: 'all' | 'ready' | 'failed' | 'processing' | 'reported';
  cursor?: string;
  limit?: string;
}

export interface AdminCommentsQuery {
  flagged?: string;
  cursor?: string;
  limit?: string;
}

export interface AdminReportsQuery {
  status?: 'pending' | 'reviewed' | 'dismissed' | 'all';
  cursor?: string;
  limit?: string;
}

export interface UserIdParams {
  id: string;
}

export interface PhotoIdParams {
  id: string;
}

export interface CommentIdParams {
  id: string;
}

export interface ReportIdParams {
  id: string;
}
