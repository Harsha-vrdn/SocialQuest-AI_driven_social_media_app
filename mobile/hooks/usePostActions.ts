import { useCallback } from 'react';
import type { Post } from '../types';
import type { SocialQuestController } from './useSocialQuestController';

export type PostActionProps = Pick<SocialQuestController, 'toggleLike' | 'beginEditPost' | 'deletePost' | 'shareResource' | 'openComments' | 'setSelectedUser' | 'reportPost'>;

export function usePostActions({ toggleLike, beginEditPost, deletePost, shareResource, openComments, setSelectedUser, reportPost }: PostActionProps) {
  const onShare = useCallback((post: Post) => void shareResource('A SocialQuest moment', 'Come see this community moment on SocialQuest.', '/s/post/' + post.id + '/'), [shareResource]);
  return { onLike: toggleLike, onEdit: beginEditPost, onDelete: deletePost, onShare, onComments: openComments, onOpenProfile: setSelectedUser, onReport: reportPost };
}
