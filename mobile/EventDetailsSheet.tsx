import {useTheme} from './ThemeProvider';
import type {PropsWithChildren} from 'react';
import {ScrollView} from 'react-native';
import {DetailSheet} from './DetailSheet';

export function EventDetailsSheet({visible, eventId, onClose, children}: PropsWithChildren<{
  visible: boolean; eventId?: number; onClose: () => void;
}>) {
  const {theme} = useTheme();
  return <DetailSheet visible={visible} sheetKey={eventId} title="EVENT DETAILS" closeLabel="Close event details" onClose={onClose}>
    {/* Only changing events resets the offset; refreshing this event does not.
        No custom pan handler competes with the native iOS sheet's scroll handoff. */}
    <ScrollView key={eventId} accessibilityLabel="Event details" style={{flex: 1, minHeight: 0}}
      contentContainerStyle={{paddingTop: 16, paddingBottom: 16}}
      showsVerticalScrollIndicator indicatorStyle={theme.scheme === 'dark' ? 'white' : 'black'} nestedScrollEnabled directionalLockEnabled
      alwaysBounceVertical keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {children}
    </ScrollView>
  </DetailSheet>;
}
