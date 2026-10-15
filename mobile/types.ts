import type { Ionicons } from '@expo/vector-icons';
import type * as ImagePicker from 'expo-image-picker';
import type { ComponentProps } from 'react';
import type { AttachmentRef } from './attachmentProtocol';
import type { DeliveryStatus } from './MessageStatus';

export type Tab = 'Home' | 'Explore' | 'Chats' | 'Notifications' | 'Reels' | 'Profile' | 'Settings';
export type User = { id: number; username: string; display_name?: string; bio?: string; city?: string; avatar?: string; xp?: number; karma?: number; follower_count?: number; following_count?: number; is_followed_by_me?: boolean; is_online?: boolean };
export type PeoplePanel = { kind: 'search' | 'followers' | 'following' | 'invite'; person?: User; eventId?: number };
export type AttendanceStatus = 'INVITED' | 'PENDING' | 'ACCEPTED' | 'DENIED' | 'CANCELLED';
export type EventItem = { id: number; name: string; description: string; cover_image?: string; location_name: string; latitude?: number | null; longitude?: number | null; starts_at: string; ends_at: string; accepted_count: number; capacity: number; privacy: 'PUBLIC' | 'PRIVATE'; host: User; my_attendance_status?: AttendanceStatus | null; is_finished?: boolean; quest_status?: string; recommendation_reason?: string };
export type EventEditor = { id?: number; name: string; description: string; location_name: string; latitude?: number | null; longitude?: number | null; starts_at: string; ends_at: string; capacity: string; privacy: 'PUBLIC' | 'PRIVATE' };
export type CommentItem = { id: number; parent?: number | null; author: User; body: string; created_at: string };
export type Post = { id: number; kind: 'POST' | 'REEL'; body: string; media?: string; location_name?: string; quest_title?: string; event_name?: string; event?: number | null; recommendation_reason?: string; author: User; created_at: string; like_count: number; comment_count: number; liked_by_me?: boolean; recent_comments?: CommentItem[] };
export type Quest = { id: number; event: number; event_name?: string; kind: 'MAIN' | 'SIDE'; title: string; instructions: string; xp_reward: number; my_submission?: { status: string } | null };
export type Conversation = { id: number; is_group?: boolean; event?: number | null; event_name?: string; title?: string; display_name: string; participants: User[]; unread_count: number; read_through_message_id: number; latest_message?: { id: number; body: string; created_at: string; deleted_for_everyone?: boolean; attachment?: AttachmentRef | null } };
export type ChatMessage = { id: number; body: string; sender: User; created_at: string; edited_at?: string | null; deleted_for_everyone?: boolean; attachment?: AttachmentRef | null; client_id?: string | null; delivery_status?: DeliveryStatus | null; error?: string };
export type Reaction = 'LIKE' | 'DISLIKE' | 'NONE';
export type RatingItem = { id: number; target: User; reaction: Reaction };
export type AttendanceItem = { id: number; user: User; status: AttendanceStatus };
export type NotificationItem = { id: number; kind: 'EVENT_INVITE' | 'INVITE_ACCEPTED' | 'RSVP' | 'RSVP_ACCEPTED' | 'RSVP_DENIED' | 'EVENT_ENDED' | 'COMMENT_REPLY'; text: string; event?: { id: number; name: string } | null; comment_post_id?: number | null; created_at: string; is_read: boolean };
export type PhotoEditorState = { original: ImagePicker.ImagePickerAsset; working: ImagePicker.ImagePickerAsset };
export type PhotoOperation = 'rotate-left' | 'rotate-right' | 'mirror';
export type IoniconName = ComponentProps<typeof Ionicons>['name'];

