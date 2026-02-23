export interface SearchQuery {
  q: string;
  limit?: string;
}

export interface UserIdParams {
  id: string;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: string;
}
