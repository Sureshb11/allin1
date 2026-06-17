// Gate — wrap any pro-gated UI:  <Gate feature="stats">...</Gate>
// Renders children when the user is entitled (today: always, free tier = all features).
// When Pro launches and the backend gates a feature, this shows `fallback` instead —
// pass a small upsell card, or rely on the default locked placeholder.
//
// Remember: this is UX only. The API enforces the real limit (402 pro_required).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { can } from '../utils/entitlements';

export default function Gate({ feature, children, fallback, navigation }) {
  if (can(feature)) return children;
  if (fallback !== undefined) return fallback;
  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.85}
      onPress={() => navigation?.navigate?.('Premium')}
    >
      <Icon name="lock-outline" size={22} color="#abd600" />
      <Text style={s.title}>Premium feature</Text>
      <Text style={s.sub}>Upgrade to unlock this.</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center', gap: 4, padding: 20, margin: 16, borderRadius: 16, backgroundColor: '#171b28', borderWidth: 1, borderColor: 'rgba(150,180,230,0.12)' },
  title: { color: '#dfe2f3', fontSize: 15, fontWeight: '800', marginTop: 4 },
  sub: { color: '#8d90a2', fontSize: 13 },
});
