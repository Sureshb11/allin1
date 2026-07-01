import { useTheme, useThemedStyles } from "../theme/ThemeContext";import { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert } from
'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import legendsApi from '../services/LegendsApi';















const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

const BadgeDetailScreen = ({ navigation }) => {const DS = useTheme().colors;const styles = useThemedStyles(makeStyles);
  const [userBadges, setUserBadges] = useState([]);
  const [availableBadges, setAvailableBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('earned');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerBackVisible: true,
      headerTitle: 'Badges',
    });
  }, [navigation]);

  useEffect(() => {
    loadBadgeData();
  }, []);

  const loadBadgeData = async () => {
    try {
      const userBadgesResponse = await legendsApi.getUserBadges();
      const availableBadgesResponse = await legendsApi.getAvailableBadges();
      const leaderboardResponse = await legendsApi.getBadgeLeaderboard();

      if (userBadgesResponse.success) {
        setUserBadges(userBadgesResponse.data);
      }
      if (availableBadgesResponse.success) {
        setAvailableBadges(availableBadgesResponse.data);
      }
      if (leaderboardResponse.success) {
        setLeaderboard(leaderboardResponse.data);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load badge data');
    } finally {
    }
  };

  const renderBadgeItem = ({ item, isEarned = false }) =>
  <View style={[styles.badgeCard, !isEarned && styles.unearnedBadgeCard]}>
      <View style={styles.badgeIconContainer}>
        <View style={styles.badgeIconCircle}>
          <Icon name="shield-star-outline" size={32} color={isEarned ? DS.lime : DS.textMuted} />
        </View>
        {isEarned &&
      <View style={styles.earnedOverlay}>
            <Icon name="check-circle" size={20} color={DS.lime} />
          </View>
      }
      </View>
      <Text style={styles.badgeTitle}>{item.title}</Text>
      <Text style={styles.badgeDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.badgeProgress}>
        {isEarned ?
      <View style={styles.earnedContainer}>
            <Text style={styles.earnedDate}>Earned: {item.earnedDate}</Text>
            <Text style={styles.badgePoints}>+{item.points} points</Text>
          </View> :

      <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${item.progress || 0}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {item.current || 0}/{item.required || 100}
            </Text>
          </View>
      }
      </View>
    </View>;


  const renderLeaderboardItem = ({ item, index }) =>
  <View style={styles.leaderboardItem}>
      <View style={styles.leaderboardRank}>
        <Text style={styles.rankText}>#{index + 1}</Text>
        {index < 3 &&
      <Icon name="medal" size={20} color={MEDAL_COLORS[index]} style={styles.medalIcon} />
      }
      </View>
      <View style={styles.leaderboardInfo}>
        <Text style={styles.leaderboardName}>{item.name}</Text>
        <Text style={styles.leaderboardTeam}>{item.team}</Text>
      </View>
      <View style={styles.leaderboardStats}>
        <Text style={styles.leaderboardBadges}>{item.badges} badges</Text>
        <Text style={styles.leaderboardPoints}>{item.points} pts</Text>
      </View>
    </View>;


  const tabs = [
  { id: 'earned', title: 'My Badges', icon: 'trophy' },
  { id: 'available', title: 'Available', icon: 'target' },
  { id: 'leaderboard', title: 'Leaderboard', icon: 'podium' }];


  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Badges & Achievements</Text>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => navigation.navigate('BadgeLeaderboardFilter')}>
          <Icon name="tune" size={18} color={DS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        {tabs.map((tab) =>
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, activeTab === tab.id && styles.activeTab]}
          onPress={() => setActiveTab(tab.id)}>
            <Icon
            name={tab.icon}
            size={16}
            color={activeTab === tab.id ? DS.lime : DS.textMuted}
            style={styles.tabIcon} />
          
            <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
              {tab.title}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tabContent}>
        {activeTab === 'earned' &&
        <FlatList
          data={userBadges}
          renderItem={({ item }) => renderBadgeItem({ item, isEarned: true })}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.badgeRow}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
          <View style={styles.emptyContainer}>
                <Icon name="shield-off-outline" size={48} color={DS.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyText}>No badges earned yet</Text>
                <Text style={styles.emptySubtext}>Complete matches and achievements to earn badges!</Text>
              </View>
          } />

        }

        {activeTab === 'available' &&
        <FlatList
          data={availableBadges}
          renderItem={({ item }) => renderBadgeItem({ item, isEarned: false })}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.badgeRow}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
          <View style={styles.emptyContainer}>
                <Icon name="shield-search" size={48} color={DS.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyText}>No available badges</Text>
              </View>
          } />

        }

        {activeTab === 'leaderboard' &&
        <FlatList
          data={leaderboard}
          renderItem={renderLeaderboardItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
          <View style={styles.emptyContainer}>
                <Icon name="podium-remove" size={48} color={DS.textMuted} style={styles.emptyIcon} />
                <Text style={styles.emptyText}>Leaderboard not available</Text>
              </View>
          } />

        }
      </View>
    </View>);

};

const makeStyles = (DS) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DS.bg
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: DS.surfaceLow
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: DS.textPrimary
  },
  filterButton: {
    backgroundColor: DS.surfaceHighest,
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: DS.surfaceLow,
    paddingHorizontal: 16
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  activeTab: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 12,
    marginVertical: 4
  },
  tabIcon: {
    marginRight: 6
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.textMuted
  },
  activeTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: DS.lime
  },
  tabContent: {
    flex: 1,
    padding: 16
  },
  badgeRow: {
    justifyContent: 'space-between'
  },
  badgeCard: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    width: '48%',
    alignItems: 'center'
  },
  unearnedBadgeCard: {
    opacity: 0.6
  },
  badgeIconContainer: {
    position: 'relative',
    marginBottom: 12
  },
  badgeIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: DS.surfaceHighest,
    justifyContent: 'center',
    alignItems: 'center'
  },
  earnedOverlay: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: DS.surfaceHigh,
    borderRadius: 20
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.textPrimary,
    textAlign: 'center',
    marginBottom: 4
  },
  badgeDescription: {
    fontSize: 11,
    color: DS.textVariant,
    textAlign: 'center',
    marginBottom: 12
  },
  badgeProgress: {
    width: '100%'
  },
  earnedContainer: {
    alignItems: 'center'
  },
  earnedDate: {
    fontSize: 11,
    color: DS.textMuted,
    marginBottom: 4
  },
  badgePoints: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.lime
  },
  progressContainer: {
    alignItems: 'center'
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: DS.surfaceHighest,
    borderRadius: 20,
    marginBottom: 4
  },
  progressFill: {
    height: '100%',
    backgroundColor: DS.lime,
    borderRadius: 20
  },
  progressText: {
    fontSize: 11,
    color: DS.textMuted
  },
  leaderboardItem: {
    backgroundColor: DS.surfaceHigh,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  leaderboardRank: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 40
  },
  rankText: {
    fontSize: 15,
    fontWeight: '800',
    color: DS.lime
  },
  medalIcon: {
    marginTop: 4
  },
  leaderboardInfo: {
    flex: 1
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '800',
    color: DS.textPrimary
  },
  leaderboardTeam: {
    fontSize: 12,
    fontWeight: '600',
    color: DS.textVariant,
    marginTop: 2
  },
  leaderboardStats: {
    alignItems: 'flex-end'
  },
  leaderboardBadges: {
    fontSize: 13,
    fontWeight: '800',
    color: DS.lime
  },
  leaderboardPoints: {
    fontSize: 11,
    color: DS.textMuted,
    marginTop: 2
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50
  },
  emptyIcon: {
    marginBottom: 16
  },
  emptyText: {
    fontSize: 14,
    color: DS.textVariant,
    textAlign: 'center',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 12,
    color: DS.textMuted,
    textAlign: 'center'
  }
});

export default BadgeDetailScreen;