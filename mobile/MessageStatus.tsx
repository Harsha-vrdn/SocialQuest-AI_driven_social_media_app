import {Text, View} from 'react-native';
import {useTheme} from './ThemeProvider';
import {fonts} from './theme';

export type DeliveryStatus = 'sending' | 'failed' | 'sent' | 'read';
export const deliveryLabels: Record<DeliveryStatus, string> = {
  sending: 'Sending…', failed: 'Not sent · tap to retry', sent: 'Sent · not read', read: 'Read',
};
export function MessageStatus({status, group = false, retryHint = true}: {status: DeliveryStatus; group?: boolean; retryHint?: boolean}) {
  const {theme: {colors, scheme}} = useTheme();
  const color = status === 'read' ? (scheme === 'dark' ? '#4ADE80' : '#15803D')
    : status === 'sent' ? '#FACC15'
    : scheme === 'dark' ? '#FF6B6B' : '#DC2626';
  const label = status === 'read' && group ? 'Read by everyone' : status === 'failed' && !retryHint ? 'Not sent' : deliveryLabels[status];
  return <View accessible accessibilityLabel={label} style={{flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1}}>
    <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: color, borderWidth: status === 'sent' ? 1 : 0, borderColor: '#854D0E'}} />
    <Text style={{fontFamily: fonts.copy, fontSize: 10, lineHeight: 15, color: colors.muted, flexShrink: 1}}>{label}</Text>
  </View>;
}
