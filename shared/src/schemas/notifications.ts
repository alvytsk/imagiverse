export type NotificationType = 'like' | 'comment';

export interface NotificationPayload {
  actorId: string;
  actorUsername: string;
  actorDisplayName: string;
  photoId: string;
  commentId?: string;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  read: boolean;
  createdAt: string;
}

export interface UnreadCountResponse {
  count: number;
}
