import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, StatusBar } from 'react-native';
import legendsApi from '../services/LegendsApi';












const CreateProductScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('equipment');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const categories = [
  { id: 'equipment', name: 'Equipment' },
  { id: 'services', name: 'Services' },
  { id: 'apparel', name: 'Apparel' },
  { id: 'accessories', name: 'Accessories' }];


  const handleCreate = async () => {
    if (!title.trim()) return Alert.alert('Error', 'Title is required');
    if (!description.trim()) return Alert.alert('Error', 'Description is required');
    if (!price || isNaN(parseInt(price, 10))) return Alert.alert('Error', 'Valid price is required');

    setLoading(true);
    try {
      const res = await legendsApi.createMarketplaceProduct({
        title: title.trim(),
        description: description.trim(),
        price: parseInt(price, 10),
        category,
        location: location.trim() || undefined
      });

      if (res.success) {
        Alert.alert('Success', 'Product listed successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', res.error || 'Failed to create listing');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={DS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <Text style={styles.headerBackArrow}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CREATE A LISTING</Text>
        <View style={styles.headerProfileIcon}>
          <Text style={styles.headerProfileText}>P</Text>
        </View>
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* Category Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SELECT CATEGORY</Text>
          <View style={styles.categoriesRow}>
            {categories.map((c) =>
            <TouchableOpacity
              key={c.id}
              style={[
              styles.categoryChip,
              category === c.id && styles.categoryChipActive]
              }
              onPress={() => setCategory(c.id)}>
                <Text
                style={[
                styles.categoryChipText,
                category === c.id && styles.categoryChipTextActive]
                }>
                  {c.name}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.formCard}>
          <Text style={styles.label}>Headline</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. English Willow Bat"
            placeholderTextColor={DS.textMuted} />
          

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your item..."
            placeholderTextColor={DS.textMuted}
            multiline
            numberOfLines={4} />
          

          <Text style={styles.label}>Price (INR)</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 5000"
            placeholderTextColor={DS.textMuted}
            keyboardType="numeric" />
          

          <Text style={styles.label}>Venue</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Search for a venue..."
            placeholderTextColor={DS.textMuted} />
          
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ?
          <ActivityIndicator color={DS.bg} /> :

          <Text style={styles.submitButtonText}>POST LISTING</Text>
          }
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: DS.bg
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: DS.bg
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DS.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerBackArrow: {
    color: DS.textPrimary,
    fontSize: 18,
    fontWeight: '600'
  },
  headerTitle: {
    color: DS.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2
  },
  headerProfileIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: DS.surfaceHighest,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerProfileText: {
    color: DS.textVariant,
    fontSize: 14,
    fontWeight: '600'
  },
  container: {
    flex: 1,
    paddingHorizontal: 16
  },
  section: {
    marginTop: 8,
    marginBottom: 20
  },
  sectionTitle: {
    color: DS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 14
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  categoryChip: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  categoryChipActive: {
    backgroundColor: DS.lime
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: DS.textMuted
  },
  categoryChipTextActive: {
    color: DS.bg
  },
  formCard: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    padding: 18,
    marginBottom: 24
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: DS.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: DS.surfaceLow,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: DS.textPrimary,
    borderWidth: 0
  },
  textArea: {
    height: 110,
    textAlignVertical: 'top',
    paddingTop: 13
  },
  submitButton: {
    backgroundColor: DS.lime,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitButtonText: {
    color: DS.bg,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  bottomSpacer: {
    height: 40
  }
});

export default CreateProductScreen;