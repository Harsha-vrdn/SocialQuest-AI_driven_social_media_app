import type { Reaction, User } from '../types';

export const rows = <T,>(data: T[] | { results?: T[] } | null | undefined): T[] => Array.isArray(data) ? data : data?.results || [];
export const nameOf = (user?: User | null) => user?.display_name || user?.username || 'SocialQuest member';
export const initial = (user?: User | null) => nameOf(user).trim().slice(0, 1).toUpperCase();
export const dateOf = (date: string) => new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
export const reactionLabel = (reaction: Reaction) => reaction === 'LIKE' ? '♥ Like' : reaction === 'DISLIKE' ? '× Dislike' : '— None';
export const AUTH_TOKEN_KEY = 'socialquest_auth_token';
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const iconLabelRow = { alignItems: 'center', flexDirection: 'row', gap: 5 } as const;

