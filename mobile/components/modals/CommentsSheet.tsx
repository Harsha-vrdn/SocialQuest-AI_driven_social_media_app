import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { getAppStyles } from '../../appStyles';
import { Avatar } from '../../components/Avatar';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { MotionModal as Modal, SoftPressable as Pressable } from '../../Motion';
import { useTheme } from '../../ThemeProvider';
import type { CommentItem, Post } from '../../types';
import { dateOf, nameOf, rows } from '../../utils/social';

type Props = Pick<SocialQuestController, 'api' | 'me' | 'commentPost' | 'setCommentPost' | 'setSelectedUser' | 'updateCommentCount' | 'loadNotifications'> & { ref?: Ref<CommentsHandle> };

export type CommentsHandle = { openComments: (post: Post) => Promise<void>; closeComments: () => void };

export const CommentsSheet = memo(function CommentsSheet({ api, me, commentPost, setCommentPost, setSelectedUser, updateCommentCount, loadNotifications, ref }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const activeCommentPostId = useRef<number | null>(null);
  const commentPanelVersion = useRef(0);
  const commentRequestVersion = useRef(0);
  const commentInFlight = useRef(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [editingComment, setEditingComment] = useState<CommentItem | null>(null);
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const commentInputRef = useRef<TextInput>(null);
  const loadComments = async (postId: number) => {
    if (activeCommentPostId.current !== postId) return;
    const version = ++commentRequestVersion.current;
    const result = rows<CommentItem>(await api('/comments/?post=' + postId));
    if (activeCommentPostId.current === postId && version === commentRequestVersion.current) setComments(result);
  };
  const openComments = async (post: Post) => {
    activeCommentPostId.current = post.id;
    const panelVersion = ++commentPanelVersion.current;
    setCommentPost(post);
    setComments(post.recent_comments || []);
    setCommentBody('');
    setEditingComment(null);
    setReplyingTo(null);
    try { await loadComments(post.id); } catch (error: any) {
      if (panelVersion === commentPanelVersion.current) Alert.alert('Could not load comments', error.message);
    }
  };
  const closeComments = () => {
    activeCommentPostId.current = null;
    commentPanelVersion.current += 1; commentRequestVersion.current += 1;
    Keyboard.dismiss();
    setCommentPost(null);
    setCommentBody('');
    setEditingComment(null);
    setReplyingTo(null);
  };
  const replyToComment = (comment: CommentItem) => {
    if (commentInFlight.current) return;
    const mention = '@' + comment.author.username + ' ';
    setEditingComment(null);
    setReplyingTo(comment);
    setCommentBody(current => current.startsWith(mention) ? current : mention + current);
    requestAnimationFrame(() => commentInputRef.current?.focus());
  };
  const clearReplyTarget = () => {
    const mention = replyingTo ? '@' + replyingTo.author.username + ' ' : '';
    if (mention) setCommentBody(current => current.startsWith(mention) ? current.slice(mention.length) : current);
    setReplyingTo(null);
  };
  const saveComment = async () => {
    const body = commentBody.trim();
    if (!commentPost || !body || commentInFlight.current) return;
    commentInFlight.current = true; setCommentSubmitting(true);
    const postId = commentPost.id;
    const panelVersion = commentPanelVersion.current;
    const isCurrentPanel = () => activeCommentPostId.current === postId && commentPanelVersion.current === panelVersion;
    let saved = false;
    try {
      const isNewComment = !editingComment;
      if (editingComment) await api('/comments/' + editingComment.id + '/', { method: 'PATCH', body: JSON.stringify({ body }) });
      else await api('/comments/', { method: 'POST', body: JSON.stringify({ post: postId, parent: replyingTo?.id || null, body }) });
      saved = true;
      if (isNewComment) updateCommentCount(postId, 1);
      if (!isCurrentPanel()) return;
      setCommentBody('');
      setEditingComment(null);
      setReplyingTo(null);
      await Promise.all([loadComments(postId), loadNotifications()]);
    } catch (error: any) {
      if (isCurrentPanel()) Alert.alert(saved ? 'Reply saved' : 'Could not save comment', saved ? 'Your reply was saved. Reopen the comments to refresh them.' : error.message);
    } finally { commentInFlight.current = false; setCommentSubmitting(false); }
  };
  const commentThreadIds = (rootId: number) => {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      comments.forEach(comment => {
        if (comment.parent && ids.has(comment.parent) && !ids.has(comment.id)) {
          ids.add(comment.id);
          changed = true;
        }
      });
    }
    return ids;
  };
  const showCommentOptions = (comment: CommentItem) => {
    if (commentInFlight.current || comment.author.id !== me?.id) return;
    const deletedIds = commentThreadIds(comment.id);
    Alert.alert('Your comment', 'Edit it or delete it permanently.', [
      { text: 'Edit', onPress: () => { setReplyingTo(null); setEditingComment(comment); setCommentBody(comment.body); requestAnimationFrame(() => commentInputRef.current?.focus()); } },
      { text: 'Delete', style: 'destructive', onPress: () => void api('/comments/' + comment.id + '/', { method: 'DELETE' }).then(() => { if (commentPost) { setComments(current => current.filter(item => !deletedIds.has(item.id))); updateCommentCount(commentPost.id, -deletedIds.size); } }).catch((error: any) => Alert.alert('Could not delete comment', error.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  useEffect(() => () => { activeCommentPostId.current = null; commentPanelVersion.current++; commentRequestVersion.current++; }, []);
  useImperativeHandle(ref, () => ({ openComments, closeComments }));
  const rootComments = comments.filter(comment => !comment.parent || !comments.some(candidate => candidate.id === comment.parent));
  const renderCommentThread = (comment: CommentItem, depth = 0): ReactNode => {
    const childComments = comments.filter(candidate => candidate.parent === comment.id);
    return <View key={comment.id} style={[styles.commentThread, depth > 0 && styles.commentThreadChild]}>
      <Pressable accessibilityLabel={nameOf(comment.author) + ': ' + comment.body}
        accessibilityRole="button"
        onLongPress={() => showCommentOptions(comment)}
        style={[styles.commentCard, depth > 0 && styles.subcommentCard]}>
        <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(comment.author) + "'s profile"} onPress={() => { closeComments(); setSelectedUser(comment.author); }}>
          <Avatar user={comment.author} />
        </Pressable>
        <View style={styles.commentCopy}>
          <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + nameOf(comment.author) + "'s profile"} onPress={() => { closeComments(); setSelectedUser(comment.author); }}>
            <Text style={styles.personName}>{nameOf(comment.author)}</Text>
          </Pressable>
          <Text style={styles.commentBody}>{comment.body}</Text>
          <View style={styles.commentActions}>
            <Text style={styles.personMeta}>{dateOf(comment.created_at)}{comment.author.id === me?.id ? ' · hold to manage' : ''}</Text>
            <Pressable accessibilityRole="button"
              accessibilityLabel={'Reply to ' + nameOf(comment.author)}
              onPress={() => replyToComment(comment)}
              onLongPress={() => showCommentOptions(comment)}
              style={styles.commentReply}>
              <Text style={styles.commentReplyText}>Reply</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
      {childComments.map(child => renderCommentThread(child, depth + 1))}
    </View>;
  };

  return <><Modal visible={!!commentPost} transparent animationType="slide" onRequestClose={closeComments}>
    <KeyboardAvoidingView style={styles.modalKeyboardAvoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'} keyboardVerticalOffset={0}>
      <Pressable accessible={false} feedback="none" style={styles.overlay} onPress={closeComments}>
        <Pressable accessible={false} feedback="none" style={[styles.sheet, styles.commentsSheet]} onPress={event => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.commentsHeader}>
            <View style={styles.commentsHeaderCopy}>
              <Text style={styles.sheetTitle}>Replies</Text>
              <Text numberOfLines={1} style={styles.commentPostPreview}>{commentPost ? nameOf(commentPost.author) + ' · ' + (commentPost.body || 'Shared a moment') : ''}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close replies" onPress={closeComments} style={styles.commentsClose}>
              <Ionicons name="close" size={23} color={colors.text} />
            </Pressable>
          </View>
          <Text style={styles.sheetCopy}>{comments.length ? 'Join the conversation.' : 'Be the first to leave a thoughtful reply.'}</Text>
          <ScrollView style={styles.commentList}
            contentContainerStyle={styles.commentListContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled">
            {comments.length ? rootComments.map(comment => renderCommentThread(comment)) : <View style={styles.commentEmpty}>
              <Text style={styles.muted}>No replies yet.</Text>
              <Text style={styles.commentEmptyCopy}>A good conversation starts with one kind thought.</Text>
            </View>}
          </ScrollView>
          {editingComment ? <View style={styles.commentEditing}>
            <Text style={styles.commentEditingText}>Editing your reply</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel comment edit" onPress={() => { setEditingComment(null); setCommentBody(''); }}>
              <Text style={styles.commentEditingCancel}>Cancel</Text>
            </Pressable>
          </View> : null}
          {replyingTo ? <View style={styles.commentEditing}>
            <Text numberOfLines={1} style={styles.commentEditingText}>Replying to @{replyingTo.author.username}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Stop replying to this comment" onPress={clearReplyTarget}>
              <Ionicons name="close-circle-outline" size={21} color={colors.danger} />
            </Pressable>
          </View> : null}
          <View style={styles.commentComposer}>
            <Avatar user={me} />
            <TextInput accessibilityLabel={editingComment ? 'Edit your reply' : 'Write a reply'}
              numberOfLines={3}
              ref={commentInputRef}
              style={styles.commentInput}
              maxLength={500}
              value={commentBody}
              onChangeText={setCommentBody}
              editable={!commentSubmitting}
              placeholder={editingComment ? 'Edit your reply' : 'Add a reply…'}
              placeholderTextColor={colors.muted}
              multiline
              returnKeyType="default"
              blurOnSubmit={false} />
            <Pressable accessibilityRole="button"
              accessibilityLabel={commentSubmitting ? 'Saving reply' : editingComment ? 'Save reply' : 'Post reply'}
              disabled={commentSubmitting || !commentBody.trim()}
              onPress={() => void saveComment()}
              style={[styles.commentSend, (commentSubmitting || !commentBody.trim()) && styles.commentSendDisabled]}>
              {commentSubmitting ? <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} /> : <Ionicons name={editingComment ? 'checkmark' : 'arrow-up'} size={22} color={(commentSubmitting || !commentBody.trim()) ? colors.muted : colors.onPrimary} />}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal></>;
});
