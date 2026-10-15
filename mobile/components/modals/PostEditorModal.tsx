import { memo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { getAppStyles } from '../../appStyles';
import type { SocialQuestController } from '../../hooks/useSocialQuestController';
import { MotionModal as Modal, SoftPressable as Pressable } from '../../Motion';
import { useTheme } from '../../ThemeProvider';

type Props = Pick<SocialQuestController, 'editingPost' | 'setEditingPost' | 'savePostEdit'>;

export const PostEditorModal = memo(function PostEditorModal({ editingPost, setEditingPost, savePostEdit }: Props) {
  const { theme } = useTheme();
  const styles = getAppStyles(theme);
  const [editBody, setEditBody] = useState(editingPost?.body || '');
  const [editLocation, setEditLocation] = useState(editingPost?.location_name || '');
  return <Modal visible={!!editingPost} transparent animationType="slide" onRequestClose={() => setEditingPost(null)}>
    <Pressable accessible={false} feedback="none" style={styles.overlay} onPress={() => setEditingPost(null)}>
      <Pressable accessible={false} feedback="none" style={styles.sheet} onPress={event => event.stopPropagation()}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Edit your moment.</Text>
        <TextInput accessibilityLabel="Post caption" style={styles.momentInput} maxLength={1200} value={editBody} onChangeText={setEditBody} placeholder="What happened?" multiline />
        <TextInput accessibilityLabel="Post location" style={styles.editLocation} maxLength={120} value={editLocation} onChangeText={setEditLocation} placeholder="Location (optional)" />
        <View style={styles.editActions}>
          <Pressable accessibilityLabel="Cancel" accessibilityRole="button" style={styles.cancelEdit} onPress={() => setEditingPost(null)}>
            <Text style={styles.cancelEditText}>Cancel</Text>
          </Pressable>
          <Pressable accessibilityLabel="Save changes" accessibilityRole="button" style={[styles.primary, styles.rowAction]} onPress={() => void savePostEdit(editBody, editLocation)}>
            <Text style={styles.primaryText}>Save changes</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
});
