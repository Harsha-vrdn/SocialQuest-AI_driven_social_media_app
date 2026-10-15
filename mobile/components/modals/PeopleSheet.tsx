import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useState } from 'react';
import { FlatList, Keyboard, Text, TextInput, View } from 'react-native';
import { getAppStyles, getSocialStyles } from '../../appStyles';
import { Avatar } from '../../components/Avatar';
import { Score } from '../../components/Score';
import { SearchIcon } from '../../components/SearchIcon';
import { DetailSheet } from '../../DetailSheet';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { SoftPressable as Pressable } from '../../Motion';
import { useTheme } from '../../ThemeProvider';
import type { Post } from '../../types';
import { iconLabelRow, nameOf } from '../../utils/social';
import { useProfileContent, type ProfileContentProps } from '../useProfileContent';

type Props = ProfileContentProps & Pick<SocialQuestController, 'selectedUser' | 'peoplePanel' | 'commentPost' | 'editingPost' | 'composeOpen' | 'closePeople' | 'setSelectedUser' | 'loadPeopleList' | 'setPeoplePanel' | 'refreshing' | 'refresh' | 'refreshVisibleProfile' | 'me' | 'openPeopleList' | 'followBusy' | 'toggleFollow' | 'openChat' | 'openProfileEditor' | 'shareResource' | 'peopleLoading' | 'peopleResults' | 'peopleError' | 'invitePerson'>;

export const PeopleSheet = memo(function PeopleSheet(props: Props) {
  const {
    selectedUser,
    peoplePanel,
    commentPost,
    editingPost,
    composeOpen,
    closePeople,
    setSelectedUser,
    loadPeopleList,
    setPeoplePanel,
    refreshing,
    refresh,
    refreshVisibleProfile,
    me,
    openPeopleList,
    followBusy,
    toggleFollow,
    openChat,
    openProfileEditor,
    shareResource,
    peopleLoading,
    peopleResults,
    peopleError,
    invitePerson
  } = props;
  const { filteredProfilePosts, renderProfilePost, profileTabs, profileLoadNotice, profileEmpty } = useProfileContent(props);

  const [peopleQuery, setPeopleQuery] = useState('');
  useEffect(() => { setPeopleQuery(''); }, [peoplePanel]);
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const socialStyles = getSocialStyles(theme);
  return <><DetailSheet visible={(!!selectedUser || !!peoplePanel) && !commentPost && !editingPost && !composeOpen}
    sheetKey={selectedUser ? 'profile-' + selectedUser.id : peoplePanel?.kind + '-' + peoplePanel?.person?.id}
    title={selectedUser ? 'PROFILE' : 'PEOPLE'}
    closeLabel="Close people"
    onClose={closePeople}
    heightRatio={0.82}
    headerLeft={selectedUser && peoplePanel ? <Pressable accessibilityRole="button"
      accessibilityLabel="Back to people list"
      style={[socialStyles.closeButton, iconLabelRow]} onPress={() => { setSelectedUser(null); void loadPeopleList(peoplePanel, peopleQuery); }}>
      <Ionicons name="chevron-back" size={18} color={colors.text} />
      <Text style={styles.secondaryText}>Back</Text>
    </Pressable> : peoplePanel?.person ? <Pressable accessibilityRole="button"
      accessibilityLabel="Back to profile"
      style={[socialStyles.closeButton, iconLabelRow]} onPress={() => { const owner = peoplePanel.person!; setPeoplePanel(null); setSelectedUser(owner); }}>
      <Ionicons name="chevron-back" size={18} color={colors.text} />
      <Text style={styles.secondaryText}>Profile</Text>
    </Pressable> : null}
    headerActions={selectedUser ? <Pressable accessibilityRole="button"
      accessibilityLabel="Refresh profile"
      disabled={refreshing}
      style={socialStyles.closeButton} onPress={() => void refresh(refreshVisibleProfile)}>
      <Ionicons name="refresh-outline" size={21} color={colors.text} />
    </Pressable> : null}>
    {selectedUser ? <FlatList<Post>
      key={'profile-' + selectedUser.id}
      style={[{ flex: 1, minHeight: 0 }, styles.sheetPostList]}
      data={filteredProfilePosts}
      keyExtractor={post => String(post.id)}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      alwaysBounceVertical
      directionalLockEnabled
      keyboardDismissMode="on-drag"
      contentContainerStyle={socialStyles.profileList}
      ListHeaderComponent={<View style={styles.listCopy}>
        <Avatar user={selectedUser} large />
        <Text style={styles.sheetTitle}>{nameOf(selectedUser)}</Text>
        <Text style={styles.sheetCopy}>@{selectedUser.username} · {selectedUser.city || 'Everywhere'}</Text>
        <View style={styles.userScoreLine}>
          <Text style={styles.personName}>★ {selectedUser.karma ?? 0} karma</Text>
          <Text style={styles.personName}>✦ {selectedUser.xp || 0} XP</Text>
        </View>
        <View style={socialStyles.followScores}>
          <Score tone="neutral" label="FOLLOWERS ›" value={String(selectedUser.follower_count || 0)} onPress={() => openPeopleList('followers', selectedUser)} />
          <Score tone="neutral" label="FOLLOWING ›" value={String(selectedUser.following_count || 0)} onPress={() => openPeopleList('following', selectedUser)} />
        </View>
        <Text style={styles.sheetCopy}>{selectedUser.bio || 'Here to turn small plans into meaningful stories.'}</Text>
        {selectedUser.id !== me?.id ? <>
          <Pressable accessibilityLabel={followBusy ? 'Updating…' : selectedUser.is_followed_by_me ? 'Following · Unfollow' : 'Follow'}
            accessibilityRole="button"
            disabled={followBusy}
            style={[styles.secondary, followBusy && styles.dim]} onPress={() => void toggleFollow(selectedUser)}>
            <Text style={styles.secondaryText}>{followBusy ? 'Updating…' : selectedUser.is_followed_by_me ? 'Following · Unfollow' : 'Follow'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Send a message" accessibilityRole="button" style={styles.primary} onPress={() => void openChat(selectedUser)}>
            <View style={iconLabelRow}>
              <Text style={styles.primaryText}>Send a message</Text>
              <Ionicons name="paper-plane-outline" size={18} color={colors.onPrimary} />
            </View>
          </Pressable>
        </> : <Pressable accessibilityLabel="Edit profile" accessibilityRole="button" style={styles.secondary} onPress={openProfileEditor}>
          <Text style={styles.secondaryText}>Edit profile</Text>
        </Pressable>}
        <Pressable accessibilityLabel="Share profile"
          accessibilityRole="button"
          style={[styles.secondary, iconLabelRow]} onPress={() => void shareResource('A SocialQuest profile', 'Meet ' + nameOf(selectedUser) + ' on SocialQuest.', '/?view=profile&profile=' + selectedUser.id)}>
          <Ionicons name="share-social-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryText}>Share profile</Text>
        </Pressable>
        {profileTabs(false)}
        {profileLoadNotice}
      </View>}
      ListEmptyComponent={profileEmpty}
      renderItem={({ item }) => renderProfilePost(item)}
    /> : peoplePanel ? <>
      <Text style={styles.sheetTitle}>{peoplePanel.kind === 'invite' ? 'Invite people' : peoplePanel.kind === 'search' ? 'Search people' : peoplePanel.kind === 'followers' ? 'Followers' : 'Following'}</Text>
      {peoplePanel.person ? <Text style={styles.personMeta}>@{peoplePanel.person.username}</Text> : null}
      <View style={styles.searchRow}>
        <TextInput accessibilityLabel="Search people"
          style={styles.searchInput}
          value={peopleQuery}
          onChangeText={setPeopleQuery}
          placeholder="Name or username"
          placeholderTextColor={colors.muted}
          maxLength={100}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={peoplePanel.kind === 'search'}
          returnKeyType="search"
          onSubmitEditing={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }} />
        <Pressable accessibilityRole="button"
          accessibilityLabel="Search"
          style={[styles.searchButton, { minWidth: 44, minHeight: 44 }]} onPress={() => { Keyboard.dismiss(); void loadPeopleList(peoplePanel, peopleQuery); }}>
          <SearchIcon />
        </Pressable>
      </View>
      <FlatList alwaysBounceVertical
        directionalLockEnabled
        keyboardDismissMode="on-drag"
        style={socialStyles.peopleList}
        data={peopleLoading ? [] : peopleResults}
        keyboardShouldPersistTaps="handled"
        keyExtractor={person => String(person.id)}
        ListEmptyComponent={<View style={socialStyles.peopleEmpty}>
          <Text accessibilityLiveRegion="polite" style={styles.sheetCopy}>{peopleLoading ? 'Loading people…' : peopleError || (peopleQuery.trim() ? 'No matching people. Try another name or username.' : peoplePanel.kind === 'followers' ? 'No followers yet.' : peoplePanel.kind === 'following' ? 'Not following anyone yet.' : 'No other members yet.')}</Text>
          {peopleError ? <Pressable accessibilityLabel="Try again" accessibilityRole="button" style={styles.secondary} onPress={() => void loadPeopleList(peoplePanel, peopleQuery)}>
            <Text style={styles.secondaryText}>Try again</Text>
          </Pressable> : null}
        </View>}
        renderItem={({ item }) => <Pressable accessibilityRole="button"
          accessibilityLabel={(peoplePanel.kind === 'invite' ? 'Invite ' : 'Open ') + nameOf(item)}
          style={styles.personCard} onPress={() => { Keyboard.dismiss(); if (peoplePanel.kind === 'invite') void invitePerson(item); else setSelectedUser(item); }}>
          <Avatar user={item} />
          <View style={socialStyles.personCopy}>
            <Text style={styles.personName}>{nameOf(item)}</Text>
            <Text style={styles.personMeta}>@{item.username}{item.is_followed_by_me ? ' · Following' : ''}</Text>
          </View>
          <Text style={styles.secondaryText}>{peoplePanel.kind === 'invite' ? 'Invite' : '›'}</Text>
        </Pressable>} />
    </> : null}
  </DetailSheet></>;
});
