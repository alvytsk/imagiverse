export interface PhotoIdParams {
  photoId: string;
}

export interface CommentIdParams {
  id: string;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: string;
}
