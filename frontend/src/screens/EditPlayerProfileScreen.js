import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import legendsApi from '../services/LegendsApi';














const EditPlayerProfileScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [profile, setProfile] = useState({
    name: '', email: '', phone: '', city: '', state: '', country: '',
    battingStyle: '', bowlingStyle: '', dateOfBirth: '', height: '', weight: '', bio: '',
  });
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Edit Profile',
    });
  }, [navigation]);

  // Load the real profile (no mock defaults).
  useEffect(() => {
    legendsApi.getUserProfile().then((res) => {
      const u = res?.success ? (res.data || {}) : {};
      const name = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim();
      setProfile((prev) => ({ ...prev, name, phone: u.phone || '', bio: u.bio || '' }));
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const parts = (profile.name || '').trim().split(/\s+/);
    const firstName = parts.shift() || 'Player';
    const lastName = parts.join(' ') || '-';
    const res = await legendsApi.updateUserProfile({ firstName, lastName, bio: profile.bio || null });
    setSaving(false);
    if (res.success) {
      Alert.alert('Success', 'Profile updated.');
      navigation.goBack();
    } else {
      Alert.alert('Error', res.error || 'Could not update profile.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Player Profile</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={profile.name}
            onChangeText={(text) => setProfile({ ...profile, name: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={profile.email}
            onChangeText={(text) => setProfile({ ...profile, email: text })}
            keyboardType="email-address"
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={profile.phone}
            onChangeText={(text) => setProfile({ ...profile, phone: text })}
            keyboardType="phone-pad"
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>City</Text>
          <TextInput
            style={styles.input}
            value={profile.city}
            onChangeText={(text) => setProfile({ ...profile, city: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>State</Text>
          <TextInput
            style={styles.input}
            value={profile.state}
            onChangeText={(text) => setProfile({ ...profile, state: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Country</Text>
          <TextInput
            style={styles.input}
            value={profile.country}
            onChangeText={(text) => setProfile({ ...profile, country: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Batting Style</Text>
          <TextInput
            style={styles.input}
            value={profile.battingStyle}
            onChangeText={(text) => setProfile({ ...profile, battingStyle: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bowling Style</Text>
          <TextInput
            style={styles.input}
            value={profile.bowlingStyle}
            onChangeText={(text) => setProfile({ ...profile, bowlingStyle: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={styles.input}
            value={profile.dateOfBirth}
            onChangeText={(text) => setProfile({ ...profile, dateOfBirth: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Height</Text>
          <TextInput
            style={styles.input}
            value={profile.height}
            onChangeText={(text) => setProfile({ ...profile, height: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Weight</Text>
          <TextInput
            style={styles.input}
            value={profile.weight}
            onChangeText={(text) => setProfile({ ...profile, weight: text })}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={profile.bio}
            onChangeText={(text) => setProfile({ ...profile, bio: text })}
            multiline
            numberOfLines={4}
            placeholderTextColor={DS.textMuted} />
          
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save Profile</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: DS.surfaceLow
  },
  backButton: {
    fontSize: 16,
    color: DS.lime,
    marginRight: 16
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: DS.textPrimary
  },
  form: {
    padding: 16
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: DS.textMuted,
    marginBottom: 8
  },
  input: {
    backgroundColor: DS.surfaceLow,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: DS.textPrimary
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top'
  },
  saveButton: {
    backgroundColor: DS.lime,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20
  },
  saveButtonText: {
    color: DS.bg,
    fontSize: 16,
    fontWeight: '600'
  }
});

export default EditPlayerProfileScreen;