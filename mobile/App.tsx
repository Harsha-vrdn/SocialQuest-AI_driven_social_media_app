import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppearanceSettings } from './AppearanceSettings';
import { getAppStyles, getGlassStyles, getNotificationStyles } from './appStyles';
import { Avatar } from './components/Avatar';
import { ChatEditorModal } from './components/modals/ChatEditorModal';
import { CommentsSheet } from './components/modals/CommentsSheet';
import { EventDetailsModal } from './components/modals/EventDetailsModal';
import { EventEditorModal } from './components/modals/EventEditorModal';
import { PeopleSheet } from './components/modals/PeopleSheet';
import { PostComposerModal } from './components/modals/PostComposerModal';
import { PostEditorModal } from './components/modals/PostEditorModal';
import { GlassBackdrop, GlassPreferenceProvider, useLiquidGlass } from './GlassBackdrop';
import { GestureRoot } from './GestureRoot';
import { useSocialQuestController } from './hooks/useSocialQuestController';
import { MotionModal as Modal, MotionProvider, SoftPressable as Pressable, PulseBadge, ScreenTransition } from './Motion';
import { RelativeTimeProvider } from './PostTime';
import { ProfileEditor } from './ProfileEditor';
import { ChatsScreen } from './screens/ChatsScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ReelsScreen } from './screens/ReelsScreen';
import { SettingsScreen } from './SettingsScreen';
import { SlidingTabs } from './SlidingTabs';
import { ThemeProvider, useTheme } from './ThemeProvider';
import type { IoniconName, Tab } from './types';
import { iconLabelRow, nameOf } from './utils/social';

export default function App() {
  return <ThemeProvider><GestureRoot>
    <ThemedApp />
  </GestureRoot></ThemeProvider>;
}

function ThemedApp() {
  const { theme } = useTheme();
  const { colors } = theme;
  const barStyle = theme.scheme === 'dark' ? 'light' : 'dark';
  const [fontsLoaded, fontError] = useFonts({ DepartureMono: require('./assets/fonts/DepartureMono-Regular.otf') });
  return <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
    <RelativeTimeProvider>
      <MotionProvider>
        <GlassPreferenceProvider>
          <StatusBar style={barStyle} />
          <NavigationBar style={barStyle} />
          {!fontsLoaded && !fontError ? <View style={{ flex: 1, backgroundColor: colors.background }} /> : <SocialQuestApp />}
        </GlassPreferenceProvider>
      </MotionProvider>
    </RelativeTimeProvider>
  </SafeAreaProvider>;
}

function SocialQuestApp() {
  const { theme } = useTheme();
  const { colors, gradients } = theme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = getAppStyles(theme);
  const glassStyles = getGlassStyles(theme);
  const nativeGlass = useLiquidGlass();
  const [navHeight, setNavHeight] = useState(72);
  const navBottom = Math.max(insets.bottom, 12);
  const bottomContentInset = nativeGlass ? navHeight + navBottom : 0;
  const notificationStyles = getNotificationStyles(theme);
  const c = useSocialQuestController();
  const {
    accountLoading,
    activeChat,
    activeChatId,
    api,
    appActive,
    attachmentClient,
    authReady,
    authenticate,
    beginEditPost,
    beginQuestProof,
    busy,
    cancelRsvp,
    chatBackActive,
    chatDraftCache,
    chatEditor,
    chatMembersOpen,
    closePeople,
    commentPost,
    commentsRef,
    composeOpen,
    composerRef,
    confirmLogout,
    conversations,
    deleteEvent,
    deleteMessage,
    deletePost,
    deviceNotifications,
    displayName,
    editingPost,
    email,
    emailInput,
    eventEditor,
    eventEditorClosing,
    eventEditorRef,
    eventPosts,
    eventQuests,
    eventRatings,
    eventRequests,
    eventAttendanceRevision,
    events,
    exploreDraft,
    findNearbyEvents,
    followBusy,
    following,
    hostedEvents,
    invitePerson,
    join,
    joinedEvents,
    loadChats,
    loadDiscover,
    loadFeed,
    loadMe,
    loadMessages,
    loadNotifications,
    loadPeopleList,
    logout,
    markChatRead,
    markNotificationsRead,
    me,
    messageOptions,
    messages,
    mode,
    nearbyActive,
    notifications,
    openChat,
    openComments,
    openComposer,
    openEvent,
    openEventChat,
    openEventEditor,
    openInviteList,
    openNotification,
    openPeopleList,
    openProfileEditor,
    outbox,
    password,
    passwordInput,
    peopleError,
    peopleLoading,
    peoplePanel,
    peopleResults,
    posts,
    profileEditorOpen,
    profilePosts,
    profilePostsError,
    profilePostsLoading,
    profilePostsOwner,
    profileSection,
    profileUserId,
    rateAttendee,
    ratingTargets,
    reels,
    refresh,
    refreshVisibleProfile,
    refreshing,
    reportPost,
    reviewEventItem,
    saveChatEditor,
    savePostEdit,
    saveProfile,
    searchFocusRequest,
    searchKind,
    searchResetRequest,
    selectedEvent,
    selectedUser,
    sessionToken,
    setActiveChat,
    setChatEditor,
    setChatMembersOpen,
    setCommentPost,
    setComposeOpen,
    setDisplayName,
    setEditingPost,
    setEmail,
    setEventEditorClosing,
    setEventEditorVisible,
    setMessageOptions,
    setMessages,
    setMode,
    setNearbyActive,
    setPassword,
    setPeoplePanel,
    setProfileEditorOpen,
    setProfileSection,
    setSearchFocusRequest,
    setSearchKind,
    setSelectedEvent,
    setSelectedUser,
    setTab,
    setUsername,
    shareResource,
    showChatOptions,
    showFailedMessage,
    showMessageOptions,
    tab,
    toggleFollow,
    toggleLike,
    token,
    updateCommentCount,
    username,
    usernameInput
  } = c;
  const notificationPermissionCard = <View style={notificationStyles.card}>
    <Text style={notificationStyles.copy}>{deviceNotifications.message}</Text>
    <Pressable accessibilityLabel={deviceNotifications.busy ? 'Please wait…' : deviceNotifications.enabled ? 'Turn off notifications' : deviceNotifications.settingsNeeded ? 'Open notification settings' : 'Enable notifications'}
      accessibilityRole="button"
      disabled={deviceNotifications.busy}
      style={styles.secondary} onPress={() => void (deviceNotifications.enabled ? deviceNotifications.disable() : deviceNotifications.enable())}>
      <Text style={styles.secondaryText}>{deviceNotifications.busy ? 'Please wait…' : deviceNotifications.enabled ? 'Turn off notifications' : deviceNotifications.settingsNeeded ? 'Open notification settings' : 'Enable notifications'}</Text>
    </Pressable>
  </View>;

  if (!authReady) return <View style={styles.auth}>
    <Text style={styles.authWordBrand}>SocialQuest</Text>
    <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
    <Text style={styles.copy}>Restoring your adventure…</Text>
  </View>;

  if (!token) {
    return <View style={styles.auth}>
      <View style={[styles.authArt, { paddingTop: insets.top + 24 }]}>
        <LinearGradient colors={gradients.auth} style={styles.authBackdrop} />
        <View pointerEvents="none" style={styles.authOrbitLarge} />
        <View pointerEvents="none" style={styles.authOrbitSmall} />
        <View style={styles.authArtContent}>
          <View style={styles.authWordmark}>
            <View style={styles.bigMark}>
              <Text style={styles.markText}>S</Text>
            </View>
            <Text style={styles.authWordBrand}>SocialQuest</Text>
          </View>
          <Text style={styles.authKicker}>REAL WORLD · REAL PEOPLE</Text>
          <Text style={[styles.authDisplayTitle, width < 360 && styles.authDisplayTitleCompact]}>A little adventure.{`\n`}<Text style={styles.authDisplayTitleAccent}>A real connection.</Text></Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authForm}>
        <ScrollView contentContainerStyle={[styles.authContent, { paddingBottom: insets.bottom + 34 }]} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>{mode === 'login' ? 'WELCOME IN' : 'START YOUR STORY'}</Text>
          <Text style={styles.authTitle}>{mode === 'login' ? 'Find your people.' : 'Start your story.'}</Text>
          <Text style={styles.authDescription}>{mode === 'login' ? 'Log in and see what your community is up to.' : 'A few details and you are ready for your first quest.'}</Text>
          {mode === 'register' && <><Text style={styles.authLabel}>DISPLAY NAME</Text><TextInput accessibilityLabel="Display name"
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="What should people call you?"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => usernameInput.current?.focus()} /></>}
          <Text style={styles.authLabel}>USERNAME</Text>
          <TextInput ref={usernameInput}
            accessibilityLabel="Username"
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="your_username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'login' ? 'username' : 'username-new'}
            textContentType="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => (mode === 'register' ? emailInput : passwordInput).current?.focus()} />
          {mode === 'register' && <><Text style={styles.authLabel}>EMAIL</Text><TextInput ref={emailInput}
            accessibilityLabel="Email"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordInput.current?.focus()} /></>}
          <Text style={styles.authLabel}>PASSWORD</Text>
          <TextInput ref={passwordInput}
            accessibilityLabel="Password"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={authenticate} />
          <Pressable accessibilityLabel={mode === 'login' ? 'Log in' : 'Create account'}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            style={[styles.primary, iconLabelRow, busy && styles.dim]} onPress={authenticate}
            disabled={busy}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : null}
            <Text style={styles.primaryText}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in →' : 'Create my account →'}</Text>
          </Pressable>
          <Pressable accessibilityLabel={mode === 'login' ? 'Create an account' : 'Log in to your account'}
            accessibilityRole="button"
            onPress={() => setMode(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.switchText}>{mode === 'login' ? 'New here?  Create an account' : 'Already a member?  Log in'}</Text>
          </Pressable>
          <AppearanceSettings />
          <Text style={styles.authNote}>By continuing, you agree to build a kind, consent-first community.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>;
  }

  const home = <HomeScreen posts={posts}
    reportPost={reportPost}
    me={me}
    events={events}
    refresh={refresh}
    loadFeed={loadFeed}
    refreshing={refreshing}
    accountLoading={accountLoading}
    setSearchFocusRequest={setSearchFocusRequest}
    setTab={setTab}
    findNearbyEvents={findNearbyEvents}
    openEvent={openEvent}
    openComposer={openComposer}
    notificationsEnabled={deviceNotifications.enabled}
    toggleLike={toggleLike}
    beginEditPost={beginEditPost}
    deletePost={deletePost}
    shareResource={shareResource}
    openComments={openComments}
    setSelectedUser={setSelectedUser}
    bottomContentInset={bottomContentInset} />;
  const explore = <ExploreScreen api={api}
    exploreDraft={exploreDraft}
    searchResetRequest={searchResetRequest}
    setNearbyActive={setNearbyActive}
    searchKind={searchKind}
    setSearchKind={setSearchKind}
    searchFocusRequest={searchFocusRequest}
    events={events}
    nearbyActive={nearbyActive}
    eventAttendanceRevision={eventAttendanceRevision}
    findNearbyEvents={findNearbyEvents}
    openEventEditor={openEventEditor}
    openEvent={openEvent}
    setSelectedUser={setSelectedUser}
    bottomContentInset={bottomContentInset} />;
  const reelsView = <ReelsScreen reels={reels}
    refresh={refresh}
    loadFeed={loadFeed}
    refreshing={refreshing}
    accountLoading={accountLoading}
    setSelectedUser={setSelectedUser}
    toggleLike={toggleLike}
    openComments={openComments}
    shareResource={shareResource}
    playbackEnabled={appActive && !commentPost && !selectedUser && !peoplePanel && !composeOpen && !editingPost && !selectedEvent && !eventEditor && !eventEditorClosing && !profileEditorOpen}
    bottomContentInset={bottomContentInset} />;
  const chats = <ChatsScreen conversations={conversations}
    activeChat={activeChat}
    following={following}
    refresh={refresh}
    loadChats={loadChats}
    refreshing={refreshing}
    accountLoading={accountLoading}
    me={me}
    openChat={openChat}
    setSelectedUser={setSelectedUser}
    setActiveChat={setActiveChat}
    setChatMembersOpen={setChatMembersOpen}
    appActive={appActive}
    outbox={outbox}
    messages={messages}
    chatBackActive={chatBackActive}
    markChatRead={markChatRead}
    loadMessages={loadMessages}
    showFailedMessage={showFailedMessage}
    showMessageOptions={showMessageOptions}
    attachmentClient={attachmentClient}
    sessionToken={sessionToken}
    token={token}
    activeChatId={activeChatId}
    setMessages={setMessages}
    chatDraftCache={chatDraftCache}
    showChatOptions={showChatOptions}
    bottomContentInset={bottomContentInset} />;
  const notificationsView = <NotificationsScreen notifications={notifications}
    refresh={refresh}
    loadNotifications={loadNotifications}
    refreshing={refreshing}
    accountLoading={accountLoading}
    markNotificationsRead={markNotificationsRead}
    openNotification={openNotification}
    bottomContentInset={bottomContentInset} />;
  const profile = <ProfileScreen beginEditPost={beginEditPost}
    reportPost={reportPost}
    deletePost={deletePost}
    hostedEvents={hostedEvents}
    joinedEvents={joinedEvents}
    loadMe={loadMe}
    me={me}
    openComments={openComments}
    openEvent={openEvent}
    openPeopleList={openPeopleList}
    openProfileEditor={openProfileEditor}
    profilePosts={profilePosts}
    profilePostsError={profilePostsError}
    profilePostsLoading={profilePostsLoading}
    profilePostsOwner={profilePostsOwner}
    profileSection={profileSection}
    profileUserId={profileUserId}
    refresh={refresh}
    refreshVisibleProfile={refreshVisibleProfile}
    refreshing={refreshing}
    setProfileSection={setProfileSection}
    setSelectedUser={setSelectedUser}
    setTab={setTab}
    shareResource={shareResource}
    toggleLike={toggleLike}
    bottomContentInset={bottomContentInset} />;
  const unreadMessageCount = conversations.reduce((count, chat) => count + (chat.unread_count || 0), 0);
  const unreadCount = notifications.filter(item => !item.is_read).length;
  const settingsView = me ? <SettingsScreen bottomInset={bottomContentInset}
    key={me.id}
    userId={me.id}
    profileCity={me.city}
    api={api}
    notifications={notificationPermissionCard}
    onBack={() => setTab('Profile')}
    onLocationSaved={() => { setNearbyActive(false); void loadDiscover().catch(() => { }); }}
    onLogout={confirmLogout}
    onAccountSuspended={() => logout(true)} /> : null;
  const mobileTabs: Array<{ tab: Tab; label: string; icon: IoniconName; activeIcon: IoniconName }> = [
    { tab: 'Home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { tab: 'Explore', label: 'Events', icon: 'compass-outline', activeIcon: 'compass' },
    { tab: 'Chats', label: 'Chats', icon: 'chatbubble-ellipses-outline', activeIcon: 'chatbubble-ellipses' },
    { tab: 'Reels', label: 'Reels', icon: 'play-circle-outline', activeIcon: 'play-circle' },
    { tab: 'Profile', label: 'Profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
  ];
  const isChatOpen = tab === 'Chats' && !!activeChat;
  const view = tab === 'Home' ? home : tab === 'Explore' ? explore : tab === 'Chats' ? chats : tab === 'Notifications' ? notificationsView : tab === 'Reels' ? reelsView : tab === 'Settings' ? settingsView : profile;

  return <View style={styles.app}>
    {!isChatOpen && <View style={[styles.appHeader, { paddingTop: insets.top + 13 }]}>
      <Pressable accessibilityLabel="Go to Home" accessibilityRole="button" style={styles.brandRow} onPress={() => setTab('Home')}>
        <View style={styles.smallMark}>
          <Text style={styles.smallMarkText}>S</Text>
        </View>
        <Text style={styles.appBrand}>socialquest</Text>
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" style={styles.headerAction} onPress={() => setTab('Notifications')}>
          <GlassBackdrop native radius={16} /><Ionicons name="notifications-outline" size={21} color={colors.muted} />
          {unreadCount ? <PulseBadge style={styles.headerNotificationBadge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </PulseBadge> : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share a moment" style={styles.headerCompose} onPress={() => openComposer(null)}>
          <Ionicons name="add" size={25} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>}
    <ScreenTransition fade={!nativeGlass} style={[styles.content, isChatOpen && { paddingTop: insets.top, paddingBottom: insets.bottom }]} transitionKey={tab}>
      {view}
    </ScreenTransition>
    {!isChatOpen && <View onLayout={event => setNavHeight(event.nativeEvent.layout.height)}
      style={[styles.nav, glassStyles.toolbar, nativeGlass && styles.floatingNav, { marginBottom: nativeGlass ? navBottom : Math.max(insets.bottom - 14, 8) },
        Platform.OS === 'android' && { marginHorizontal: 0, marginBottom: 0, borderRadius: 0, paddingBottom: insets.bottom + 8,
          backgroundColor: colors.surface, borderTopWidth: 0.5 }]}>
      {Platform.OS !== 'android' && <GlassBackdrop native radius={24} />}<SlidingTabs items={mobileTabs.map(item => ({ ...item, badge: item.tab === 'Chats' ? unreadMessageCount : 0 }))}
        selected={tab}
        translucent={nativeGlass}
        onSelect={next => { Keyboard.dismiss(); setTab(next); if (next !== 'Chats') setActiveChat(null); if (next === 'Profile') void refresh(loadMe); }} />
    </View>}

    <Modal visible={chatMembersOpen && !!activeChat} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setChatMembersOpen(false)}>
      <View style={[styles.app, { paddingTop: Math.max(insets.top, 24) }]}>
        <View style={styles.groupHeader}>
          <Text style={[styles.sheetTitle, { flex: 1 }]}>Participants</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close participants" style={styles.commentsClose} onPress={() => setChatMembersOpen(false)}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Text style={[styles.sheetCopy, { paddingHorizontal: 20 }]}>{activeChat?.display_name}</Text>
        <FlatList data={activeChat?.participants || []}
          contentContainerStyle={styles.list}
          keyExtractor={person => String(person.id)}
          renderItem={({ item }) => <Pressable accessibilityRole="button"
            accessibilityLabel={'Open ' + nameOf(item) + "'s profile"}
            style={styles.personCard} onPress={() => { setChatMembersOpen(false); setSelectedUser(item); }}>
            <Avatar user={item} />
            <View style={{ flex: 1 }}>
              <Text style={styles.personName}>{nameOf(item)}{item.id === me?.id ? ' (you)' : ''}</Text>
              <Text style={styles.personMeta}>@{item.username}</Text>
            </View>
          </Pressable>} />
      </View>
    </Modal>
    {profileEditorOpen && token && me ? <ProfileEditor key={me.id} user={me} onSave={saveProfile} onClose={() => setProfileEditorOpen(false)} /> : null}
    <EventEditorModal key={'event-editor:' + token}
      ref={eventEditorRef}
      api={api}
      loadMe={loadMe}
      loadDiscover={loadDiscover}
      openEvent={openEvent}
      setEventEditorClosing={setEventEditorClosing}
      setEventEditorVisible={setEventEditorVisible} />
    <PostComposerModal key={'post-composer:' + token}
      ref={composerRef}
      api={api}
      me={me}
      refreshVisibleProfile={refreshVisibleProfile}
      loadFeed={loadFeed}
      loadMe={loadMe}
      openEvent={openEvent}
      setComposeOpen={setComposeOpen} />
    <PeopleSheet beginEditPost={beginEditPost}
      reportPost={reportPost}
      closePeople={closePeople}
      commentPost={commentPost}
      composeOpen={composeOpen}
      deletePost={deletePost}
      editingPost={editingPost}
      followBusy={followBusy}
      hostedEvents={hostedEvents}
      invitePerson={invitePerson}
      joinedEvents={joinedEvents}
      loadPeopleList={loadPeopleList}
      me={me}
      openChat={openChat}
      openComments={openComments}
      openPeopleList={openPeopleList}
      openProfileEditor={openProfileEditor}
      peopleError={peopleError}
      peopleLoading={peopleLoading}
      peoplePanel={peoplePanel}
      peopleResults={peopleResults}
      profilePosts={profilePosts}
      profilePostsError={profilePostsError}
      profilePostsLoading={profilePostsLoading}
      profilePostsOwner={profilePostsOwner}
      profileSection={profileSection}
      profileUserId={profileUserId}
      refresh={refresh}
      refreshVisibleProfile={refreshVisibleProfile}
      refreshing={refreshing}
      selectedUser={selectedUser}
      setPeoplePanel={setPeoplePanel}
      setProfileSection={setProfileSection}
      setSelectedUser={setSelectedUser}
      shareResource={shareResource}
      toggleFollow={toggleFollow}
      toggleLike={toggleLike} />
    <EventDetailsModal selectedEvent={selectedEvent}
      reportPost={reportPost}
      eventEditor={eventEditor}
      eventEditorClosing={eventEditorClosing}
      composeOpen={composeOpen}
      selectedUser={selectedUser}
      peoplePanel={peoplePanel}
      commentPost={commentPost}
      editingPost={editingPost}
      setSelectedEvent={setSelectedEvent}
      setSelectedUser={setSelectedUser}
      me={me}
      openEventChat={openEventChat}
      eventQuests={eventQuests}
      eventPosts={eventPosts}
      beginQuestProof={beginQuestProof}
      rateAttendee={rateAttendee}
      eventRatings={eventRatings}
      ratingTargets={ratingTargets}
      openInviteList={openInviteList}
      openEventEditor={openEventEditor}
      deleteEvent={deleteEvent}
      eventRequests={eventRequests}
      reviewEventItem={reviewEventItem}
      shareResource={shareResource}
      cancelRsvp={cancelRsvp}
      join={join}
      toggleLike={toggleLike}
      beginEditPost={beginEditPost}
      deletePost={deletePost}
      openComments={openComments} />
    <CommentsSheet key={'comments:' + token}
      ref={commentsRef}
      api={api}
      me={me}
      commentPost={commentPost}
      setCommentPost={setCommentPost}
      setSelectedUser={setSelectedUser}
      updateCommentCount={updateCommentCount}
      loadNotifications={loadNotifications} />
    <Modal visible={!!messageOptions} transparent animationType="slide" onRequestClose={() => setMessageOptions(null)}>
      <Pressable accessible={false} feedback="none" style={styles.overlay} onPress={() => setMessageOptions(null)}>
        <Pressable accessible={false} feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}>
          <Text style={styles.sheetTitle}>Message options</Text>
          {messageOptions && <>
            {messageOptions.sender.id === me?.id ? <Pressable accessibilityLabel="Edit message"
              accessibilityRole="button"
              style={styles.secondary} onPress={() => { setChatEditor({ kind: 'message', id: messageOptions.id, value: messageOptions.body }); setMessageOptions(null); }}>
              <Text style={styles.secondaryText}>Edit message</Text>
            </Pressable> : null}
            <Pressable accessibilityLabel="Delete for me"
              accessibilityRole="button"
              style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'me'); setMessageOptions(null); }}>
              <Text style={styles.secondaryText}>Delete for me</Text>
            </Pressable>
            {messageOptions.sender.id === me?.id ? <Pressable accessibilityLabel="Delete for everyone"
              accessibilityRole="button"
              style={styles.secondary} onPress={() => { void deleteMessage(messageOptions.id, 'everyone'); setMessageOptions(null); }}>
              <Text style={styles.postDeleteText}>Delete for everyone</Text>
            </Pressable> : null}
            <Pressable accessibilityLabel="Cancel" accessibilityRole="button" style={styles.secondary} onPress={() => setMessageOptions(null)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </>}
        </Pressable>
      </Pressable>
    </Modal>
    {chatEditor ? <ChatEditorModal key={chatEditor.kind + ':' + chatEditor.id} chatEditor={chatEditor} setChatEditor={setChatEditor} saveChatEditor={saveChatEditor} /> : null}
    {editingPost ? <PostEditorModal key={editingPost.id} editingPost={editingPost} setEditingPost={setEditingPost} savePostEdit={savePostEdit} /> : null}
  </View>;
}
