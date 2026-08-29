import { createNavigationContainerRef } from '@react-navigation/native';

// Where a tapped notification should land.
//
// The server has always attached a deep-link payload to every push —
// `tournamentId`, `matchId`, `chatId`, `listingId` — and nothing on this side
// read it, so every notification opened the app on whatever screen it was last
// on. This is the missing half.
//
// The mapping is deliberately narrow: a key the server actually sends, to a
// route that actually exists. An unrecognised payload falls through to the
// notification list, which is a truthful destination — it's where the thing
// they tapped is written down — rather than a guess.
export const navigationRef = createNavigationContainerRef();

export function routeForNotification(data = {}) {
  if (data.tournamentId) return ['TournamentDetail', { tournamentId: data.tournamentId }];
  if (data.matchId)      return ['Scorecard', { matchId: data.matchId }];
  if (data.chatId)       return ['Chat', { chatId: data.chatId, chatName: data.chatName || 'Chat' }];
  // Team join requests and approvals both carry the team.
  if (data.teamId)       return ['TeamProfile', { teamId: data.teamId }];
  // A new follower. The in-app list already opened the person who followed you;
  // tapping the same notification from the tray landed on the list instead, so
  // one notification had two destinations depending on where you tapped it.
  // Unclaimed followers carry no playerId and still fall through.
  if (data.playerId)     return ['PlayerProfile', { playerId: data.playerId }];
  return ['Notification', undefined];
}

export function openFromNotification(data) {
  if (!navigationRef.isReady()) return false;
  const [screen, params] = routeForNotification(data);
  try {
    navigationRef.navigate(screen, params);
    return true;
  } catch {
    return false;
  }
}
