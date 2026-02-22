/** Response shapes specific to the auth module. */

export interface UserSummary {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserSummary;
}

export interface RefreshResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}
