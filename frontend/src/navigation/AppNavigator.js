import React from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
// Dark "Kinetic Athlete" design system
const DS = {
  bg: '#0f131f',
  surfaceLow: '#171b28',
  surfaceHigh: '#262a37',
  lime: '#abd600',
  textPrimary: '#dfe2f3',
  textMuted: '#8d90a2',
};

import HomeScreen from '../screens/HomeScreen';
import CricketFeedScreen from '../screens/CricketFeedScreen';
import SportFeedScreen from '../screens/SportFeedScreen';
import FootballFeedScreen from '../sports/football/screens/FootballFeedScreen';
import BadmintonFeedScreen from '../sports/badminton/screens/BadmintonFeedScreen';
import TennisFeedScreen from '../sports/tennis/screens/TennisFeedScreen';
import MatchStatsScreen from '../screens/MatchStatsScreen';
import FindCricketersScreen from '../screens/FindCricketersScreen';
import MySportsScreen from '../screens/MySportsScreen';
import LiveScoresScreen from '../screens/LiveScoresScreen';
import ScoringScreen from '../screens/ScoringScreen';
import TeamManagementScreen from '../screens/TeamManagementScreen';
import NewsFeedScreen from '../screens/NewsFeedScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import TournamentScreen from '../screens/TournamentScreen';
import GroundBookingScreen from '../screens/GroundBookingScreen';
import PremiumScreen from '../screens/PremiumScreen';
import ChatScreen from '../screens/ChatScreen';
import StreamingLandingScreen from '../screens/StreamingLandingScreen';
import CreateStreamScreen from '../screens/CreateStreamScreen';
import VideoAnalysisScreen from '../screens/VideoAnalysisScreen';
import QuizScreen from '../screens/QuizScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MarketPlaceScreen from '../screens/MarketPlaceScreen';
import BadgeDetailScreen from '../screens/BadgeDetailScreen';
import PlayerInsightsScreen from '../screens/PlayerInsightsScreen';
import NotificationScreen from '../screens/NotificationScreen';
import GlobalSearchScreen from '../screens/GlobalSearchScreen';
import StartMatchScreen from '../screens/StartMatchScreen';
import MyCricketScreen from '../screens/MyCricketScreen';
import MyPerformanceScreen from '../screens/MyPerformanceScreen';
import TossLineupScreen from '../screens/TossLineupScreen';
import SportScoringScreen from '../screens/SportScoringScreen';
import MyMatchesScreen from '../screens/MyMatchesScreen';
import ScorecardScreen from '../screens/ScorecardScreen';
import ClubProfileScreen from '../screens/ClubProfileScreen';
import EditPlayerProfileScreen from '../screens/EditPlayerProfileScreen';
import EditTeamProfileScreen from '../screens/EditTeamProfileScreen';
import CreateProductScreen from '../screens/CreateProductScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import TournamentsScreen from '../screens/TournamentsScreen';
import LookingForScreen from '../screens/LookingForScreen';
import CoachingScreen from '../screens/CoachingScreen';
import UmpireScreen from '../screens/UmpireScreen';
import TournamentDetailScreen from '../screens/TournamentDetailScreen';
import MatchInsightsScreen from '../screens/MatchInsightsScreen';
import TeamInsightsScreen from '../screens/TeamInsightsScreen';
import PlaceholderScreen from '../screens/PlaceholderScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const HomeStack = ({ route: stackRoute, initialRouteName }) => {
  // Cricket gets its signature feed; other sports land on the (sport-aware)
  // dashboard, since the feed is cricket-specific.
  const sportId = stackRoute?.params?.initialSport?.id || 'cricket';
  const feedForSport = sportId === 'cricket' ? 'CricketFeed'
    : sportId === 'football' ? 'FootballFeed'
    : sportId === 'badminton' ? 'BadmintonFeed'
    : sportId === 'tennis' ? 'TennisFeed'
    : 'SportFeed';
  const initial = initialRouteName || feedForSport;
  return (
  <Stack.Navigator initialRouteName={initial}>
    {/* Instagram-style landing feed (cricket) */}
    <Stack.Screen
      name="CricketFeed"
      component={CricketFeedScreen}
      options={{ headerShown: false }}
    />
    {/* Dedicated football landing feed */}
    <Stack.Screen
      name="FootballFeed"
      component={FootballFeedScreen}
      options={{ headerShown: false }}
    />
    {/* Dedicated badminton landing feed (individual sport) */}
    <Stack.Screen
      name="BadmintonFeed"
      component={BadmintonFeedScreen}
      options={{ headerShown: false }}
    />
    {/* Dedicated tennis landing feed (individual sport) */}
    <Stack.Screen
      name="TennisFeed"
      component={TennisFeedScreen}
      options={{ headerShown: false }}
    />
    {/* Generic landing feed for the remaining sports */}
    <Stack.Screen
      name="SportFeed"
      component={SportFeedScreen}
      options={{ headerShown: false }}
    />
    {/* Match stats (score / period breakdown / cards / corners) for event sports */}
    <Stack.Screen
      name="MatchStats"
      component={MatchStatsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="Home"
      component={HomeScreen}
      options={{ headerShown: false }}
      initialParams={{
        initialSport:  stackRoute?.params?.initialSport,
        initialFormat: stackRoute?.params?.initialFormat,
      }}
    />
    <Stack.Screen
      name="StartMatch"
      component={StartMatchScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="TossLineup"
      component={TossLineupScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen 
      name="MyCricket" 
      component={MyCricketScreen}
      options={{
        title: 'My Cricket',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="MyMatches" 
      component={MyMatchesScreen}
      options={{
        title: 'My Matches',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="MyPerformance" 
      component={MyPerformanceScreen}
      options={{
        title: 'My Performance',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen
      name="Scoring"
      component={ScoringScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="SportScoring"
      component={SportScoringScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen 
      name="TeamManagement" 
      component={TeamManagementScreen}
      options={{
        title: 'Team Management',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="NewsFeed" 
      component={NewsFeedScreen}
      options={{
        title: 'Cricket News',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Statistics" 
      component={StatisticsScreen}
      options={{
        title: 'Statistics',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Tournaments" 
      component={TournamentsScreen}
      options={{
        title: 'Tournaments',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="GroundBooking" 
      component={GroundBookingScreen}
      options={{
        title: 'Ground Booking',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Premium" 
      component={PremiumScreen}
      options={{
        title: 'Premium',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Chat" 
      component={ChatScreen}
      options={{
        title: 'Team Chat',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="StreamingLanding" 
      component={StreamingLandingScreen}
      options={{
        title: 'Live Streaming',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="CreateStream" 
      component={CreateStreamScreen}
      options={{
        title: 'Create Stream',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="VideoAnalysis" 
      component={VideoAnalysisScreen}
      options={{
        title: 'Video Analysis',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Quiz" 
      component={QuizScreen}
      options={{
        title: 'Daily Quiz',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Profile" 
      component={ProfileScreen}
      options={{
        title: 'Profile',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="MarketPlace" 
      component={MarketPlaceScreen}
      options={{
        title: 'Marketplace',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="BadgeDetail" 
      component={BadgeDetailScreen}
      options={{
        title: 'Badges',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="PlayerInsights" 
      component={PlayerInsightsScreen}
      options={{
        title: 'Player Insights',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Notification" 
      component={NotificationScreen}
      options={{
        title: 'Notifications',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
    <Stack.Screen 
      name="Scorecard" 
      component={ScorecardScreen}
      options={{
        title: 'Scorecard',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="ClubProfile" 
      component={ClubProfileScreen}
      options={{
        title: 'Club Profile',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="EditPlayerProfile" 
      component={EditPlayerProfileScreen}
      options={{
        title: 'Edit Player Profile',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="EditTeamProfile" 
      component={EditTeamProfileScreen}
      options={{
        title: 'Edit Team Profile',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="CreatePost" 
      component={CreateProductScreen}
      options={{
        title: 'Create Post',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen 
      name="MarketPlacePostDetail" 
      component={ProductDetailScreen}
      options={{
        title: 'Product Details',
        headerStyle: {backgroundColor: DS.surfaceLow},
        headerTitleStyle: {color: DS.textPrimary},
        headerTintColor: DS.textPrimary,
      }}
    />
    <Stack.Screen
      name="GlobalSearch"
      component={GlobalSearchScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="FindCricketers"
      component={FindCricketersScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="MySports"
      component={MySportsScreen}
      options={{ headerShown: false }}
    />
    <Stack.Screen name="LookingFor" component={LookingForScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Coaching" component={CoachingScreen} options={{ headerShown: false }} />
    <Stack.Screen name="Umpires" component={UmpireScreen} options={{ headerShown: false }} />
    <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} options={{ headerShown: false }} />
    <Stack.Screen name="MatchInsights" component={MatchInsightsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="TeamInsights" component={TeamInsightsScreen} options={{ headerShown: false }} />
    <Stack.Screen name="MatchDetail" component={PlaceholderScreen} initialParams={{title: 'Match Details'}} />
    <Stack.Screen name="PlayerProfile" component={PlaceholderScreen} initialParams={{title: 'Player Profile'}} />
    <Stack.Screen name="TeamDetail" component={PlaceholderScreen} initialParams={{title: 'Team Details'}} />
    <Stack.Screen name="HelpFAQs" component={PlaceholderScreen} initialParams={{title: 'Help & FAQs'}} />
    <Stack.Screen name="ContactUs" component={PlaceholderScreen} initialParams={{title: 'Contact Us'}} />
    <Stack.Screen name="ServicesProfile" component={PlaceholderScreen} initialParams={{title: 'Services Profile'}} />
    <Stack.Screen name="QuizResult" component={PlaceholderScreen} initialParams={{title: 'Quiz Result'}} />
    <Stack.Screen name="VideoStreaming" component={PlaceholderScreen} initialParams={{title: 'Video Streaming'}} />
    <Stack.Screen name="TournamentRegistration" component={PlaceholderScreen} initialParams={{title: 'Tournament Registration'}} />
    <Stack.Screen name="BadgeLeaderboardFilter" component={PlaceholderScreen} initialParams={{title: 'Badge Leaderboard'}} />
  </Stack.Navigator>
  );
};

// "My Cricket" tab — same stack, but opens on the cricket dashboard (Home).
const MyCricketStack = (props) => <HomeStack {...props} initialRouteName="Home" />;

const ScoresStack = () => (
  <Stack.Navigator>
    <Stack.Screen 
      name="LiveScores" 
      component={LiveScoresScreen}
      options={{
        title: 'Live Scores',
        headerStyle: {backgroundColor: DS.surfaceLow, elevation: 0, shadowOpacity: 0},
        headerTitleStyle: {color: DS.textPrimary},
      }}
    />
  </Stack.Navigator>
);

const AppNavigator = ({ route: appRoute }) => {
  // sport + format passed from SportSetupScreen via navigation.replace('MainApp', { sport, format })
  const initialSport  = appRoute?.params?.sport  || null;
  const initialFormat = appRoute?.params?.format || null;

  // "My Cricket" tab adapts to the active sport (label + icon).
  const sportName = initialSport?.name || 'Cricket';
  const sportIcon = initialSport?.icon || 'cricket';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: DS.lime,
        tabBarInactiveTintColor: DS.textMuted,
        tabBarStyle: {
          backgroundColor: DS.surfaceLow,
          borderTopWidth: 0,
          elevation: 0,
          height: 58,
          paddingBottom: 6,
        },
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const map = {
            HomeTab: 'home-variant',
            MyCricketTab: sportIcon,
            ScoresTab: 'scoreboard-outline',
          };
          const name = map[route.name] || 'apps';
          return <Icon name={name} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{ tabBarLabel: 'Home' }}
        initialParams={{ initialSport, initialFormat }}
      />
      <Tab.Screen
        name="MyCricketTab"
        component={MyCricketStack}
        options={{ tabBarLabel: `My ${sportName}` }}
        initialParams={{ initialSport, initialFormat }}
      />
      <Tab.Screen
        name="ScoresTab"
        component={ScoresStack}
        options={{ tabBarLabel: 'Scores' }}
      />
    </Tab.Navigator>
  );
};

export default AppNavigator;
