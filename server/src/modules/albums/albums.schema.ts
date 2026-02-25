export interface AlbumIdParams {
  albumId: string;
}

export interface UserIdParams {
  id: string;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: string;
}
