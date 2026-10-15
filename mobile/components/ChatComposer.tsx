import { Ionicons } from '@expo/vector-icons';
import { memo, useLayoutEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { getAppStyles, getGlassStyles } from '../appStyles';
import { ChatAttachmentButton } from '../ChatAttachments';
import { GlassBackdrop, useLiquidGlass } from '../GlassBackdrop';
import type { SocialQuestController } from '../hooks/useSocialQuestController';
import { SoftPressable as Pressable } from '../Motion';
import { useTheme } from '../ThemeProvider';

type Props = Pick<SocialQuestController, 'activeChat' | 'activeChatId' | 'chatDraftCache' | 'outbox' | 'attachmentClient' | 'me' | 'sessionToken' | 'token' | 'setMessages' | 'loadMessages' | 'loadChats'> & { chatSending: boolean; setChatComposerHeight: (height: number) => void };

export const ChatComposer = memo(function ChatComposer({ activeChat, activeChatId, chatDraftCache, outbox, attachmentClient, me, sessionToken, token, setMessages, loadMessages, loadChats, chatSending, setChatComposerHeight }: Props) {
  const [chatDrafts, setChatDrafts] = useState<Record<number, string>>(chatDraftCache.current);
  const message = activeChat ? chatDrafts[activeChat.id] || '' : '';
  const setMessage = (next: string | ((value: string) => string)) => {
    const id = activeChatId.current;
    if (id) setChatDrafts(drafts => ({ ...drafts, [id]: typeof next === 'function' ? next(drafts[id] || '') : next }));
  };
  useLayoutEffect(() => { chatDraftCache.current = chatDrafts; }, [chatDrafts]);
  const send = () => {
    if (!activeChat || !outbox.enqueue(activeChat.id, message)) return;
    setMessage('');
  };

  const { theme } = useTheme();
  const { colors } = theme;
  const styles = getAppStyles(theme);
  const glassStyles = getGlassStyles(theme);
  const nativeGlass = useLiquidGlass();
  if (!activeChat) return null;
  return <View onLayout={event => setChatComposerHeight(event.nativeEvent.layout.height)} style={nativeGlass ? styles.floatingChatComposer : undefined}>
    <View style={[styles.composer, glassStyles.toolbar]}>
      <GlassBackdrop native /><ChatAttachmentButton key={String(me?.id) + ':' + activeChat.id}
        client={attachmentClient}
        conversation={activeChat.id}
        onSent={sent => { if (sessionToken.current !== token) return; if (activeChatId.current === activeChat.id) setMessages(current => current.some(item => item.id === sent.id) ? current : [...current, sent]); void Promise.allSettled([loadMessages(activeChat.id), loadChats()]); }} />
      <TextInput numberOfLines={1}
        style={styles.messageInput}
        value={message}
        onChangeText={setMessage}
        maxLength={2000}
        accessibilityLabel="Message"
        placeholder="Message…"
        placeholderTextColor={colors.muted}
        multiline />
      <Pressable accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !message.trim() || chatSending }}
        disabled={!message.trim() || chatSending}
        style={[styles.send, (!message.trim() || chatSending) && styles.sendDisabled]} onPress={send}>
        <Ionicons name="arrow-up" size={22} color={colors.onPrimary} />
      </Pressable>
    </View>
  </View>;
});
