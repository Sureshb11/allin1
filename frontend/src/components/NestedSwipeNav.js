import React, { useRef, useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, useWindowDimensions } from 'react-native';

/**
 * NestedSwipeNav
 * 
 * A two-level horizontal swipe navigation system with a smooth, continuous gesture hierarchy.
 * Level 2 acts as a continuous swipeable layer inside Level 1, and reaching either Level 2 boundary
 * seamlessly continues navigation into the adjacent Level 1 tab.
 * 
 * @param {Array} schema - Array of flattened screens: { l1: string, l2: string, id: string, component: Component, props: Object }
 * @param {Object} colors - Theme colors for styling
 * @param {Function} renderItem - Optional custom render function for the content
 */
export default function NestedSwipeNav({ schema, colors, renderItem, onIndexChange, renderL1 }) {
  const { width: SCREEN_W } = useWindowDimensions();
  const listRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  // Group schema by L1 to build headers
  const l1Groups = useMemo(() => {
    const groups = [];
    schema.forEach((item, index) => {
      let group = groups.find(g => g.l1 === item.l1);
      if (!group) {
        group = { l1: item.l1, startIndex: index, items: [] };
        groups.push(group);
      }
      group.items.push({ ...item, globalIndex: index });
    });
    return groups;
  }, [schema]);

  const activeItem = schema[currentIndex] || schema[0];
  const activeL1 = activeItem.l1;

  // Sync state with scroll position
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    {
      useNativeDriver: true,
      listener: (e) => {
        const x = e.nativeEvent.contentOffset.x;
        const idx = Math.round(x / SCREEN_W);
        if (idx >= 0 && idx < schema.length && idx !== currentIndex) {
          setCurrentIndex(idx);
          if (onIndexChange) onIndexChange(idx);
        }
      }
    }
  );

  const goToIndex = (idx) => {
    if (idx >= 0 && idx < schema.length) {
      listRef.current?.scrollToIndex({ index: idx, animated: true });
    }
  };

  const goToL1 = (l1Name) => {
    const group = l1Groups.find(g => g.l1 === l1Name);
    if (group) goToIndex(group.startIndex);
  };

  // Render L1 Header
  const renderL1Header = () => {
    if (renderL1) {
      return renderL1({ l1Groups, activeL1, goToL1 });
    }
    return (
      <View style={[s.l1Container, { borderBottomColor: colors.border }]}>
        {l1Groups.map((group) => {
          const isActive = group.l1 === activeL1;
          return (
            <TouchableOpacity
              key={group.l1}
              style={[s.l1Tab, isActive && { borderBottomColor: colors.lime, borderBottomWidth: 2 }]}
              onPress={() => goToL1(group.l1)}
            >
              <Text style={[s.l1Text, { color: isActive ? colors.lime : colors.textMuted }, isActive && s.l1TextActive]}>
                {group.l1}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const l2ScrollRef = useRef(null);
  const l2ChipLayouts = useRef({});

  // Auto-scroll the L2 header to center the active chip
  useEffect(() => {
    const layout = l2ChipLayouts.current[currentIndex];
    if (layout && l2ScrollRef.current) {
      const centerX = layout.x + layout.width / 2 - SCREEN_W / 2;
      l2ScrollRef.current.scrollTo({ x: Math.max(0, centerX), animated: true });
    }
  }, [currentIndex]);

  // Render L2 Header (Separate track per L1)
  const renderL2Header = () => {
    const activeGroupItems = l1Groups.find(g => g.l1 === activeL1)?.items || [];
    
    // If only 1 item (e.g. "My Stats -> Overview"), hide the L2 bar entirely so it doesn't waste space.
    if (activeGroupItems.length <= 1) {
      return null;
    }

    return (
      <View style={s.l2Wrapper}>
        <Animated.ScrollView 
          ref={l2ScrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={{ gap: 12, alignItems: 'center', paddingHorizontal: 16 }}
        >
          {activeGroupItems.map((item) => {
            const idx = item.globalIndex;
            const isActive = idx === currentIndex;
            
            const tabScale = scrollX.interpolate({
              inputRange: [(idx - 1) * SCREEN_W, idx * SCREEN_W, (idx + 1) * SCREEN_W],
              outputRange: [0.95, 1, 0.95],
              extrapolate: 'clamp'
            });
            
            const tabOpacity = scrollX.interpolate({
              inputRange: [(idx - 1) * SCREEN_W, idx * SCREEN_W, (idx + 1) * SCREEN_W],
              outputRange: [0.5, 1, 0.5],
              extrapolate: 'clamp'
            });

            return (
              <TouchableOpacity
                key={item.id}
                style={s.l2Tab}
                onLayout={(e) => { l2ChipLayouts.current[idx] = e.nativeEvent.layout; }}
                onPress={() => goToIndex(idx)}
              >
                <Animated.View style={[s.l2TabInner, { opacity: tabOpacity, transform: [{ scale: tabScale }], backgroundColor: isActive ? colors.surfaceHigh : 'transparent' }]}>
                  <Text style={[s.l2Text, { color: isActive ? colors.textPrimary : colors.textMuted }]}>
                    {item.l2}
                  </Text>
                </Animated.View>
              </TouchableOpacity>
            );
          })}
        </Animated.ScrollView>
      </View>
    );
  };

  const defaultRenderItem = ({ item }) => {
    const Comp = item.component;
    return (
      <View style={s.page}>
        {Comp ? <Comp {...(item.props || {})} /> : <Text style={{color: colors.textPrimary}}>Missing Component</Text>}
      </View>
    );
  };

  return (
    <View style={s.root}>
      {renderL1Header()}
      {renderL2Header()}
      <Animated.FlatList
        ref={listRef}
        data={schema}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        renderItem={renderItem || defaultRenderItem}
        getItemLayout={(data, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  page: {
    width: SCREEN_W,
    flex: 1,
  },
  l1Container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
  },
  l1Tab: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  l1Text: {
    fontSize: 15,
    fontWeight: '600',
  },
  l1TextActive: {
    fontWeight: '800',
  },
  l2Wrapper: {
    height: 48,
    position: 'relative',
  },
  l2Container: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  l2Tab: {
    justifyContent: 'center',
  },
  l2TabInner: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 999,
  },
  l2Text: {
    fontSize: 13,
    fontWeight: '700',
  }
});
