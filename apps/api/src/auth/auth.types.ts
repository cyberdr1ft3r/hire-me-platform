export type AuthenticatedRequestUser = {
  id: string;
  email: string;
  displayName: string;
};

export type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
};

export type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  user?: AuthenticatedRequestUser;
};
