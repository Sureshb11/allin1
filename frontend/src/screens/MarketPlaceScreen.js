import { useTheme, useThemedStyles } from "../theme/ThemeContext";import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















function ProductCard({ item, onPress }) {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  return (
    <TouchableOpacity style={styles.productCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.productThumb}>
        <Icon name="shopping-outline" size={28} color={DS.lime} />
      </View>
      <View style={styles.productBody}>
        <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.productDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.priceRow}>
          <Icon name="currency-inr" size={14} color={DS.lime} />
          <Text style={styles.priceVal}>{item.price}</Text>
        </View>
        {!!item.location &&
        <View style={styles.locationRow}>
            <Icon name="map-marker-outline" size={11} color={DS.textMuted} />
            <Text style={styles.locationText} numberOfLines={1}>{item.location}</Text>
          </View>
        }
        {!!item.seller &&
        <View style={styles.sellerRow}>
            <View style={styles.sellerAvatar}>
              <Text style={styles.sellerInitial}>{(item.seller || 'S')[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.sellerName} numberOfLines={1}>{item.seller}</Text>
            {!!item.postedDate && <Text style={styles.productDate}>{item.postedDate}</Text>}
          </View>
        }
        <TouchableOpacity style={styles.contactBtn}>
          <Icon name="chat-outline" size={13} color={DS.bg} />
          <Text style={styles.contactBtnText}>Contact</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>);

}

const MarketPlaceScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {loadData();}, []);

  const loadData = async () => {
    try {
      const [pRes, cRes] = await Promise.all([
      legendsApi.getMarketplaceProducts(),
      legendsApi.getMarketplaceCategories()]
      );
      if (pRes.success) setProducts(pRes.data);
      if (cRes.success) setCategories(cRes.data);
    } catch {Alert.alert('Error', 'Failed to load marketplace');} finally
    {setLoading(false);}
  };

  const allCategories = [{ id: 'all', name: 'All', icon: 'shopping' }, ...categories];

  const filtered = products.filter((p) => {
    const cat = selectedCategory === 'all' || p.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const search = !q || (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
    return cat && search;
  });

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Icon name="shopping" size={20} color={DS.lime} />
        <Text style={styles.heroTitle}>Marketplace</Text>
        <TouchableOpacity style={styles.sellPill} onPress={() => navigation.navigate('CreatePost')}>
          <Icon name="plus" size={14} color={DS.bg} />
          <Text style={styles.sellPillText}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={18} color={DS.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search cricket gear, services..."
          placeholderTextColor={DS.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery} />
        
        {searchQuery.length > 0 &&
        <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close-circle" size={18} color={DS.textMuted} />
          </TouchableOpacity>
        }
      </View>

      {/* Category chips */}
      <FlatList
        data={allCategories}
        horizontal
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipList}
        renderItem={({ item }) =>
        <TouchableOpacity
          style={[styles.chip, selectedCategory === item.id && styles.chipActive]}
          onPress={() => setSelectedCategory(item.id)}>
          
            <Text style={[styles.chipText, selectedCategory === item.id && styles.chipTextActive]}>
              {item.name}
            </Text>
          </TouchableOpacity>
        } />
      

      {/* Products grid */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={{ gap: 10 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) =>
        <ProductCard
          item={item}
          onPress={() => navigation.navigate('MarketPlacePostDetail', { productId: item.id })} />

        }
        ListEmptyComponent={
        <View style={styles.empty}>
            <Icon name="shopping-outline" size={52} color={DS.textMuted} />
            <Text style={styles.emptyTitle}>{searchQuery ? 'No results found' : 'No products yet'}</Text>
            <Text style={styles.emptySub}>Be the first to list cricket gear</Text>
          </View>
        } />
      
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: DS.bg },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, paddingTop: 52, paddingBottom: 16, paddingHorizontal: 16
  },
  heroTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DS.textPrimary },
  sellPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5
  },
  sellPillText: { fontSize: 12, fontWeight: '700', color: DS.bg },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DS.surfaceLow, margin: 16, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 10
  },
  searchInput: { flex: 1, fontSize: 14, color: DS.textPrimary },

  chipList: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: DS.surfaceHigh
  },
  chipActive: { backgroundColor: DS.lime },
  chipText: { fontSize: 12, fontWeight: '600', color: DS.textMuted },
  chipTextActive: { color: DS.bg },

  grid: { paddingHorizontal: 16, paddingBottom: 32 },
  productCard: {
    flex: 1, backgroundColor: DS.surfaceHigh, borderRadius: 16,
    marginBottom: 10
  },
  productThumb: {
    height: 100, backgroundColor: DS.surfaceLow, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    alignItems: 'center', justifyContent: 'center'
  },
  productBody: { padding: 10, gap: 4 },
  productTitle: { fontSize: 13, fontWeight: '800', color: DS.textPrimary },
  productDesc: { fontSize: 11, color: DS.textVariant, lineHeight: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  priceVal: { fontSize: 16, fontWeight: '900', color: DS.lime },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locationText: { fontSize: 10, color: DS.textMuted, flex: 1 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sellerAvatar: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: DS.surfaceHighest,
    alignItems: 'center', justifyContent: 'center'
  },
  sellerInitial: { fontSize: 8, fontWeight: '900', color: DS.lime },
  sellerName: { flex: 1, fontSize: 10, color: DS.textMuted },
  productDate: { fontSize: 9, color: DS.textMuted },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: DS.lime, borderRadius: 8, paddingVertical: 7, marginTop: 6
  },
  contactBtnText: { fontSize: 11, fontWeight: '700', color: DS.bg },

  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DS.textVariant },
  emptySub: { fontSize: 13, color: DS.textMuted }
});

export default MarketPlaceScreen;