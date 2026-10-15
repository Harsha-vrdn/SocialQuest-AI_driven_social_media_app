import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Text, View } from 'react-native';
import { EventDetailsSheet } from '../../EventDetailsSheet';
import { SoftPressable as Pressable } from '../../Motion';
import { useTheme } from '../../ThemeProvider';
import { getAppStyles } from '../../appStyles';
import { usePostActions } from '../../hooks/usePostActions';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import type { Reaction } from '../../types';
import { dateOf, iconLabelRow, nameOf, reactionLabel } from '../../utils/social';
import { Avatar } from '../Avatar';
import { PostCard } from '../PostCard';

type Props = Pick<SocialQuestController, 'selectedEvent' | 'eventEditor' | 'eventEditorClosing' | 'composeOpen' | 'selectedUser' | 'peoplePanel' | 'commentPost' | 'editingPost' | 'setSelectedEvent' | 'setSelectedUser' | 'me' | 'openEventChat' | 'eventQuests' | 'eventPosts' | 'beginQuestProof' | 'rateAttendee' | 'eventRatings' | 'ratingTargets' | 'openInviteList' | 'openEventEditor' | 'deleteEvent' | 'eventRequests' | 'reviewEventItem' | 'shareResource' | 'cancelRsvp' | 'join' | 'toggleLike' | 'beginEditPost' | 'deletePost' | 'openComments' | 'reportPost'>;

export const EventDetailsModal = memo(function EventDetailsModal(props: Props) {
  const {
    selectedEvent,
    eventEditor,
    eventEditorClosing,
    composeOpen,
    selectedUser,
    peoplePanel,
    commentPost,
    editingPost,
    setSelectedEvent,
    setSelectedUser,
    me,
    openEventChat,
    eventQuests,
    eventPosts,
    beginQuestProof,
    rateAttendee,
    eventRatings,
    ratingTargets,
    openInviteList,
    openEventEditor,
    deleteEvent,
    eventRequests,
    reviewEventItem,
    shareResource,
    cancelRsvp,
    join
  } = props;
  const postActions = usePostActions(props);
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  return <EventDetailsSheet visible={!!selectedEvent && !eventEditor && !eventEditorClosing && !composeOpen && !selectedUser && !peoplePanel && !commentPost && !editingPost}
    eventId={selectedEvent?.id}
    onClose={() => setSelectedEvent(null)}>
    {selectedEvent && <>
      <Text style={styles.eyebrow}>{dateOf(selectedEvent.starts_at).toUpperCase()} · {selectedEvent.location_name}</Text>
      <Text style={styles.sheetTitle}>{selectedEvent.name}</Text>
      <Text style={styles.sheetCopy}>{selectedEvent.description}</Text>
      <Pressable accessibilityLabel={'Open ' + nameOf(selectedEvent.host) + "'s profile"}
        accessibilityRole="button"
        style={styles.eventHost} onPress={() => setSelectedUser(selectedEvent.host)}>
        <Avatar user={selectedEvent.host} />
        <Text style={styles.hostMeta}>Hosted by {nameOf(selectedEvent.host)} · ★ {selectedEvent.host.karma ?? 0}</Text>
      </Pressable>
      {selectedEvent.host.id === me?.id || selectedEvent.my_attendance_status === 'ACCEPTED' ? <Pressable accessibilityRole="button" accessibilityLabel="Open event group chat" style={[styles.secondary, iconLabelRow]} onPress={() => void openEventChat()}>
        <Ionicons name="people-outline" size={20} color={colors.accent} />
        <Text style={styles.secondaryText}>Event group chat</Text>
      </Pressable> : null}
      <View style={styles.questNotice}>
        <Text style={styles.section}>QUEST WINDOW</Text>
        <Text style={styles.questNoticeText}>{selectedEvent.quest_status === 'ACTIVE' ? 'Quests are live! Post a photo or reel to complete a quest and earn XP. ✦' : selectedEvent.is_finished ? 'The quest window has ended. Nicely done everyone! 🎉' : 'Quests unlock when this event starts. Stay ready! ⚔️'}</Text>
      </View>
      <View style={styles.eventQuestList}>
        <Text style={styles.section}>THE QUEST LINE · {eventQuests.length}</Text>
        {eventQuests.length ? eventQuests.map(quest => <View key={quest.id} style={styles.eventQuest}>
          <Text style={styles.eventQuestKind}>{quest.kind === 'MAIN' ? '✦ MAIN QUEST' : 'SIDE QUEST'} · +{quest.xp_reward} XP</Text>
          <Text style={styles.eventQuestTitle}>{quest.title}</Text>
          <Text style={styles.eventQuestCopy}>{quest.instructions}</Text>
          {quest.my_submission ? <Text style={styles.questProofState}>✓ Completed · +{quest.xp_reward} XP</Text> : selectedEvent.quest_status === 'ACTIVE' && selectedEvent.my_attendance_status === 'ACCEPTED' ? <><Pressable accessibilityRole="button" accessibilityLabel={'Complete quest: ' + quest.title} style={[styles.questProofButton, iconLabelRow]} onPress={() => beginQuestProof(quest)}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.onPrimary} />
            <Text style={styles.questProofButtonText}>Complete quest</Text>
          </Pressable><Text style={styles.personMeta}>Share a photo or reel to earn +{quest.xp_reward} XP.</Text></> : <Text style={styles.personMeta}>{selectedEvent.quest_status === 'EXPIRED' ? 'Quest ended' : selectedEvent.my_attendance_status !== 'ACCEPTED' ? 'Join this event to complete quests.' : 'Unlocks when the event begins.'}</Text>}
        </View>) : <Text style={styles.muted}>{selectedEvent.quest_status === 'SCHEDULED' ? 'Quests unlock when the event starts.' : 'Your quest list will appear here.'}</Text>}
      </View>
      <View style={styles.eventMoments}>
        <Text style={styles.section}>QUEST MOMENTS · {eventPosts.length}</Text>
        <Text style={styles.sheetCopy}>Snaps from people who actually showed up and did the thing. 🏆</Text>
        {eventPosts.length ? eventPosts.map(post => <PostCard {...postActions} key={post.id} post={post} mine={post.author.id === me?.id} />) : <Text style={styles.muted}>No snaps yet — be the first to complete a quest! 📸</Text>}
      </View>
      {selectedEvent.is_finished && selectedEvent.my_attendance_status === 'ACCEPTED' ? <View style={styles.ratingPanel}>
        <Text style={styles.ratingTitle}>RATE YOUR FELLOW GUESTS</Text>
        <Text style={styles.ratingCopy}>Only accepted attendees can be rated. Like adds 1 karma, dislike subtracts 1, and none adds 0.</Text>
        {ratingTargets.length ? ratingTargets.map(person => {
          const selectedReaction = eventRatings.find(rating => rating.target.id === person.id)?.reaction;
          return <View key={person.id} style={styles.ratingPerson}>
            <Pressable accessibilityLabel={'Open ' + nameOf(person) + "'s profile"} accessibilityRole="button" style={styles.ratingProfile} onPress={() => setSelectedUser(person)}>
              <Avatar user={person} />
              <View style={styles.ratingPersonCopy}>
                <Text style={styles.personName}>{nameOf(person)}</Text>
                <Text style={styles.personMeta}>{selectedReaction ? 'Your response: ' + reactionLabel(selectedReaction) : 'Choose a response'}</Text>
              </View>
            </Pressable>
            <View style={styles.ratingActions}>
              {(['LIKE', 'DISLIKE', 'NONE'] as Reaction[]).map(reaction => <Pressable accessibilityLabel={reactionLabel(reaction) + ' ' + nameOf(person)}
                accessibilityRole="button"
                key={reaction}
                style={[styles.ratingChoice, selectedReaction === reaction && styles.ratingChoiceSelected]} onPress={() => void rateAttendee(person.id, reaction)}>
                <Text style={[styles.ratingChoiceText, selectedReaction === reaction && styles.ratingChoiceSelectedText]}>{reactionLabel(reaction)}</Text>
              </Pressable>)}
            </View>
          </View>;
        }) : <Text style={styles.ratingEmpty}>No other accepted attendees are available to rate.</Text>}
      </View> : null}
      {selectedEvent.host.id === me?.id ? <View style={styles.eventQuestList}>
        <Text style={styles.section}>HOST CONSOLE</Text>
        <View style={styles.ratingActions}>
          <Pressable accessibilityLabel="Invite people" accessibilityRole="button" style={styles.ratingChoice} onPress={() => openInviteList(selectedEvent.id)}>
            <Text style={styles.ratingChoiceText}>Invite people</Text>
          </Pressable>
          <Pressable accessibilityLabel="Edit event" accessibilityRole="button" style={styles.ratingChoice} onPress={() => openEventEditor(selectedEvent)}>
            <Text style={styles.ratingChoiceText}>Edit event</Text>
          </Pressable>
          <Pressable accessibilityLabel="Delete" accessibilityRole="button" style={styles.ratingChoice} onPress={deleteEvent}>
            <Text style={styles.postDeleteText}>Delete</Text>
          </Pressable>
        </View>
        {eventRequests.filter(request => request.status === 'PENDING').map(request => <View key={request.id} style={styles.eventQuest}>
          <Text style={styles.personName}>{nameOf(request.user)}</Text>
          <Text style={styles.personMeta}>{request.user.xp || 0} XP · {request.user.karma ?? 0} karma</Text>
          {!selectedEvent.is_finished ? <View style={styles.ratingActions}>
            <Pressable accessibilityLabel={'Decline request from ' + nameOf(request.user)}
              accessibilityRole="button"
              style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'DENIED')}>
              <Text style={styles.ratingChoiceText}>Decline</Text>
            </Pressable>
            <Pressable accessibilityLabel={'Accept request from ' + nameOf(request.user)}
              accessibilityRole="button"
              style={styles.ratingChoice} onPress={() => void reviewEventItem(request.id, 'ACCEPTED')}>
              <Text style={styles.ratingChoiceText}>Accept</Text>
            </Pressable>
          </View> : <Text style={styles.muted}>Requests closed</Text>}
        </View>)}
      </View> : null}
      <View style={styles.eventActionRow}>
        <Pressable accessibilityLabel="Share"
          accessibilityRole="button"
          style={[styles.eventShare, iconLabelRow]} onPress={() => void shareResource('A SocialQuest adventure', 'Join me at ' + selectedEvent.name + ' on SocialQuest.', '/?view=event&event=' + selectedEvent.id)}>
          <Ionicons name="paper-plane-outline" size={17} color={colors.text} />
          <Text style={styles.eventShareText}>Share</Text>
        </Pressable>
        {selectedEvent.host.id === me?.id ? <View style={styles.hostPill}>
          <Text style={styles.hostPillText}>You are hosting</Text>
        </View> : selectedEvent.is_finished ? <View style={styles.hostPill}>
          <Text style={styles.hostPillText}>Requests closed</Text>
        </View> : selectedEvent.my_attendance_status === 'INVITED' ? <View style={styles.inviteActions}>
          <Pressable accessibilityLabel="Cancel event RSVP" accessibilityRole="button" style={styles.ratingChoice} onPress={() => void cancelRsvp()}>
            <Text style={styles.ratingChoiceText}>Decline</Text>
          </Pressable>
          <Pressable accessibilityLabel="Accept invite" accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={join}>
            <Text style={styles.primaryText}>Accept invite</Text>
          </Pressable>
        </View> : selectedEvent.my_attendance_status === 'PENDING' || selectedEvent.my_attendance_status === 'ACCEPTED' ? <Pressable accessibilityLabel="Cancel event RSVP" accessibilityRole="button" style={styles.hostPill} onPress={() => void cancelRsvp()}>
          <Text style={styles.hostPillText}>{selectedEvent.my_attendance_status.toLowerCase()} · cancel</Text>
        </Pressable> : <Pressable accessibilityLabel={selectedEvent.my_attendance_status ? 'Request again' : 'Request to join'}
          accessibilityRole="button"
          style={[styles.primary, styles.eventJoin]} onPress={join}>
          <Text style={styles.primaryText}>{selectedEvent.my_attendance_status ? 'Request again' : 'Request to join'}</Text>
        </Pressable>}
      </View>
    </>}
  </EventDetailsSheet>;
});
