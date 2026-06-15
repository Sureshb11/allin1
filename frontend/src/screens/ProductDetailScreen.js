import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert} from 'react-native';
import legendsApi from '../services/LegendsApi';

const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  surfaceHighest: '#313442',
  lime: '#abd600',
  coral: '#ffb59e',
  blue: '#b7c4ff',
  textPrimary: '#dfe2f3',
  textVariant: '#c3c5d9',
  textMuted: '#8d90a2',
  live: '#ef4444',
};

const ProductDetailScreen = ({route, navigation}) => {
  const {productId} = route.params || {};
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProduct();
  }, []);

  const loadProduct = async () => {
    try {
      const res = await legendsApi.getMarketplaceProduct(productId);
      if (res.success) setProduct(res.data);
    } catch (e) {
      console.log('Error loading product:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <View style={[styles.container, styles.centered]}><ActivityIndicator size="large" color={DS.lime} /></View>;
  }

  if (!product) {
    return <View style={[styles.container, styles.centered]}><Text style={styles.errorText}>Product not found</Text></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <Text style={styles.imagePlaceholder}>📷</Text>
      </View>

      <View style={styles.details}>
        <Text style={styles.title}>{product.title}</Text>
        <Text style={styles.price}>₹{product.price}</Text>
        <Text style={styles.category}>{product.category}</Text>
        <Text style={styles.description}>{product.description}</Text>

        {product.location && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue}>{product.location}</Text>
          </View>
        )}

        {product.seller && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Seller</Text>
            <Text style={styles.infoValue}>{product.seller.firstName} {product.seller.lastName}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.contactButton} onPress={() => Alert.alert('Contact', 'Contact the seller via chat')}>
            <Text style={styles.contactButtonText}>Contact Seller</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.favoriteButton} onPress={() => Alert.alert('Saved', 'Added to favorites')}>
            <Text style={styles.favoriteButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: DS.bg},
  centered: {justifyContent: 'center', alignItems: 'center'},
  errorText: {fontSize: 16, color: DS.textMuted},
  imageContainer: {height: 250, backgroundColor: DS.surfaceLow, justifyContent: 'center', alignItems: 'center'},
  imagePlaceholder: {fontSize: 64},
  details: {padding: 20},
  title: {fontSize: 22, fontWeight: 'bold', color: DS.textPrimary, marginBottom: 8},
  price: {fontSize: 24, fontWeight: 'bold', color: DS.lime, marginBottom: 8},
  category: {fontSize: 14, color: DS.blue, backgroundColor: DS.surfaceHigh, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 16, overflow: 'hidden'},
  description: {fontSize: 16, color: DS.textVariant, lineHeight: 24, marginBottom: 20},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, backgroundColor: DS.surfaceLow, marginHorizontal: -20, paddingHorizontal: 20, marginBottom: 2},
  infoLabel: {fontSize: 14, color: DS.textMuted},
  infoValue: {fontSize: 14, fontWeight: '600', color: DS.textPrimary},
  actionsRow: {flexDirection: 'row', marginTop: 20},
  contactButton: {flex: 1, backgroundColor: DS.lime, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginRight: 10},
  contactButtonText: {color: DS.bg, fontSize: 16, fontWeight: '600'},
  favoriteButton: {backgroundColor: DS.surfaceHigh, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center'},
  favoriteButtonText: {fontSize: 16, fontWeight: '600', color: DS.coral},
});

export default ProductDetailScreen;
