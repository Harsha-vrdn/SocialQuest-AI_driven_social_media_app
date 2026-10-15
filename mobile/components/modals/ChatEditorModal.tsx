import { memo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { getAppStyles } from '../../appStyles';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { MotionModal as Modal, SoftPressable as Pressable } from '../../Motion';
import { useTheme } from '../../ThemeProvider';

type Props = Pick<SocialQuestController, 'chatEditor' | 'setChatEditor' | 'saveChatEditor'>;

export const ChatEditorModal = memo(function ChatEditorModal({ chatEditor, setChatEditor, saveChatEditor }: Props) {
  const { theme } = useTheme();
  const styles = getAppStyles(theme);
  const [value, setValue] = useState(chatEditor?.value || '');
  return <Modal visible={!!chatEditor} transparent animationType="slide" onRequestClose={() => setChatEditor(null)}>
    <Pressable accessible={false} feedback="none" style={styles.overlay} onPress={() => setChatEditor(null)}>
      <Pressable accessible={false} feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{chatEditor?.kind === 'conversation' ? 'Name this chat.' : 'Edit your message.'}</Text>
        <Text style={styles.sheetCopy}>{chatEditor?.kind === 'conversation' ? 'This name is visible to everyone in the chat.' : 'Your updated message will be marked as edited.'}</Text>
        <TextInput accessibilityLabel={chatEditor?.kind === 'conversation' ? 'Chat name' : 'Message text'}
          style={styles.momentInput}
          maxLength={chatEditor?.kind === 'conversation' ? 100 : 2000}
          value={value}
          onChangeText={setValue}
          placeholder={chatEditor?.kind === 'conversation' ? 'Chat name (optional)' : 'Write your message'}
          multiline={chatEditor?.kind === 'message'}
          autoFocus />
        <View style={styles.editActions}>
          <Pressable accessibilityLabel="Cancel" accessibilityRole="button" style={styles.cancelEdit} onPress={() => setChatEditor(null)}>
            <Text style={styles.cancelEditText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityLabel="Save changes" accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={() => void saveChatEditor({ ...chatEditor!, value })}>
            <Text style={styles.primaryText}>Save changes</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
});
