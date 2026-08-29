import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiConfig from '../config/apiConfig';
import { setEntitlements } from '../utils/entitlements';

const TOKEN_KEY = 'll_auth_token';

class LegendsApi {
  constructor() {
    this.baseURL = (typeof global !== 'undefined' && global.API_BASE_URL) 
      ? global.API_BASE_URL 
      : apiConfig.BASE_URL;
    this.token = null; // in-memory JWT (persisted to AsyncStorage)
  }

  // ── Auth token persistence ──────────────────────────────────────────
  async setToken(token) {
    this.token = token || null;
    try {
      if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
      else await AsyncStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore storage errors */ }
  }

  // Restore a saved session on app launch. Returns the token (or null).
  async loadToken() {
    try {
      const t = await AsyncStorage.getItem(TOKEN_KEY);
      if (t) this.token = t;
      return t || null;
    } catch {
      return null;
    }
  }

  async logout() {
    await this.setToken(null);
  }

  // Internal fetch helper with 15s timeout + 1 auto-retry on network error
  async request(path, { method = 'GET', headers = {}, body, retries = 1 } = {}) {
    const url = `${this.baseURL}${path}`;
    const finalHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (this.token) finalHeaders.Authorization = `Bearer ${this.token}`;

    const doFetch = async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      return fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));
    };

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await doFetch();
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = json?.error || `HTTP ${res.status}`;
          const e = new Error(err);
          // The message alone can't tell a caller whether retrying is worth it.
          // The status and the server's own error `code` ride along so a caller
          // that cares can distinguish "no signal, try later" from "this will
          // never succeed" — the shot queue needs exactly that to avoid retrying
          // a shot for a delivery the scorer has already undone, forever.
          // Additive: every existing caller reads .message and is unaffected.
          e.status = res.status;
          if (json?.code) e.code = json.code;
          throw e;
        }
        return json;
      } catch (err) {
        lastError = err;
        // Only retry on network errors (not HTTP 4xx/5xx)
        const isNetworkError = err.name === 'AbortError' || err.message === 'Network request failed';
        if (!isNetworkError || attempt >= retries) break;
        // Wait 1s before retry
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw lastError;
  }


  // Query-string helper for sport-scoped content lists.
  _sportQs(sport) { return sport ? `?sport=${encodeURIComponent(sport)}` : ''; }

  // Live Scores API
  async getLiveScores(params = {}) {
    try {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      const json = await this.request('/matches' + (qs ? `?${qs}` : ''));
      return { success: true, data: json.matches || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // "From Your Circle" — matches involving the logged-in user's teams
  // (owned / played-for / followed). Empty for users with no teams yet.
  async getCircleMatches(params = {}) {
    try {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      const json = await this.request('/matches/circle' + (qs ? `?${qs}` : ''));
      return { success: true, data: json.matches || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // Match Management
  async createMatch(matchData) {
    try {
      const json = await this.request('/matches', { method: 'POST', body: matchData });
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Pre-match setup for non-cricket sports: coin toss + both squads.
  // Cricket uses submitToss instead (it must also set batting/bowling sides).
  async submitMatchSetup(matchId, { tossWinnerId, choice, squads }) {
    try {
      const json = await this.request(`/matches/${matchId}/setup`, {
        method: 'POST', body: { tossWinnerId, choice, squads },
      });
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Sport Events (multi-sport scoring)
  async addSportEvent(matchId, eventData) {
    try {
      const json = await this.request(`/matches/${matchId}/sport-events`, { method: 'POST', body: eventData });
      return { success: true, data: json.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteSportEvent(matchId, eventId) {
    try {
      await this.request(`/matches/${matchId}/sport-events/${eventId}`, { method: 'DELETE' });
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async submitHistoricalStats(playerId, payload) {
    try {
      const json = await this.request(`/players/${playerId}/historical-stats`, {
        method: 'POST', body: payload
      });
      return { success: true, data: json.submission };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getHistoricalStatsStatus(playerId) {
    try {
      const json = await this.request(`/players/${playerId}/historical-stats/status`);
      return { success: true, submission: json.submission };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }


  async getSportEvents(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/sport-events`);
      return { success: true, data: json.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Rich per-sport match stats: score, period breakdown, + sport aggregates
  // (football: cards/corners; basketball: fouls/timeouts; etc.).
  async getSportStats(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/sport-stats`);
      return { success: true, data: json.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Who is keeping wicket right now. Changes hands mid-innings more often than
  // people expect, and until this the scorecard could only ever show whoever
  // was marked at the toss.
  async setMatchKeeper(matchId, { teamId, playerId }) {
    try {
      await this.request(`/matches/${matchId}/keeper`, { method: 'POST', body: { teamId, playerId } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Claim a guest player → merge its match history into your career.
  async claimPlayer(guestPlayerId) {
    try {
      const json = await this.request('/users/me/claim-player', { method: 'POST', body: { guestPlayerId } });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Polymorphic sport rules (SportConfiguration) — all sports in one call.
  async getSportConfigs() {
    try {
      const json = await this.request('/sports/config');
      return { success: true, data: json.configs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Per-sport player rankings from SportEvent tallies (non-cricket sports).
  // Cricket ranks off its ball-by-ball numbers via getPlayers() instead.
  async getLeaderboard(sport) {
    try {
      const json = await this.request('/players/leaderboard' + this._sportQs(sport));
      return { success: true, data: json.players || [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  // Team Management
  async getTeams(sport) {
    try {
      const qs = sport ? `?sport=${encodeURIComponent(sport)}` : '';
      const json = await this.request(`/teams${qs}`);
      return { success: true, data: json.teams || json.data || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async createTeam(teamData) {
    try {
      const json = await this.request('/teams', { method: 'POST', body: teamData });
      return { success: true, data: json.team };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Teams grouped for the current user: { mine, opponents, followed }.
  // `sport` scopes every list to the active sport — a user's cricket teams must
  // not appear while they're inside football.
  async getTeamsCategorized(sport) {
    try {
      const json = await this.request('/teams/categorized' + (sport ? `?sport=${encodeURIComponent(sport)}` : ''));
      return { success: true, data: { mine: json.mine || [], opponents: json.opponents || [], followed: json.followed || [] } };
    } catch (error) {
      return { success: false, error: error.message, data: { mine: [], opponents: [], followed: [] } };
    }
  }

  async followTeam(teamId) {
    try {
      await this.request(`/teams/${teamId}/follow`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async unfollowTeam(teamId) {
    try {
      await this.request(`/teams/${teamId}/follow`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Player Management. Optional filters: { sport, teamId, userId }.
  async getPlayers(params = {}) {
    try {
      const qs = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
      const json = await this.request('/players' + (qs ? `?${qs}` : ''));
      return { success: true, data: json.players || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // Community feed posts
  async getPosts(params = {}) {
    try {
      const qs = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      const json = await this.request('/posts' + (qs ? `?${qs}` : ''));
      return { success: true, data: json.posts || [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  // Bookmark toggle → { saved }. Idempotent: the server flips whichever way the
  // row currently is, so a double-tap can't desync the icon from the data.
  async toggleSavePost(id) {
    try {
      const json = await this.request(`/posts/${id}/save`, { method: 'POST' });
      return { success: true, saved: !!json.saved };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Saved posts for one sport, newest save first. Same FLAT shape as getPosts,
  // so callers must run it through mapPost before handing it to <PostCard>.
  // Follow toggle for a player → { following }. Idempotent: the server flips
  // whichever way the row currently is, so a double-tap can't desync the button.
  async toggleFollowPlayer(playerId) {
    try {
      const json = await this.request(`/players/${playerId}/follow`, { method: 'POST' });
      return { success: true, following: !!json.following };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getSavedPosts(sport) {
    try {
      const json = await this.request('/posts/saved' + this._sportQs(sport));
      return { success: true, data: json.posts || [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  async createPost({ sport = 'cricket', text, team, mediaUrl, mediaType, postType, matchId, tournamentId, playerId }) {
    try {
      const json = await this.request('/posts', { 
        method: 'POST', 
        body: { sport, text, team, mediaUrl, mediaType, postType, matchId, tournamentId, playerId } 
      });
      return { success: true, data: json.post };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Idempotent like/unlike toggle — returns the server's real { liked, likes }.
  async likePost(id) {
    try {
      const json = await this.request(`/posts/${id}/like`, { method: 'POST' });
      return { success: true, liked: json.liked, likes: json.likes, data: json.post };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getComments(postId) {
    try {
      const json = await this.request(`/posts/${postId}/comments`);
      return { success: true, data: json.comments || [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  async addComment(postId, text) {
    try {
      const json = await this.request(`/posts/${postId}/comments`, { method: 'POST', body: { text } });
      return { success: true, data: json.comment };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ── Rummy (Pool) score-board ──────────────────────────────────────
  async createRummyGame(payload) {
    try {
      const json = await this.request('/rummy/games', { method: 'POST', body: payload });
      return { success: true, data: json.game };
    } catch (e) { return { success: false, error: e.message }; }
  }
  async getRummyGames(status) {
    try {
      const qs = status ? `?status=${status}` : '';
      const json = await this.request(`/rummy/games${qs}`);
      return { success: true, data: json.games || [] };
    } catch (e) { return { success: false, error: e.message, data: [] }; }
  }
  async getRummyGame(id) {
    try {
      const json = await this.request(`/rummy/games/${id}`);
      return { success: true, data: json.game };
    } catch (e) { return { success: false, error: e.message }; }
  }
  async addRummyRound(id, scores) {
    try {
      const json = await this.request(`/rummy/games/${id}/rounds`, { method: 'POST', body: { scores } });
      return { success: true, data: json.game };
    } catch (e) { return { success: false, error: e.message }; }
  }
  async addRummyPlayer(id, name) {
    try {
      const json = await this.request(`/rummy/games/${id}/players`, { method: 'POST', body: { name } });
      return { success: true, data: json.game };
    } catch (e) { return { success: false, error: e.message }; }
  }
  async getRummyRoster() {
    try {
      const json = await this.request('/rummy/players');
      return { success: true, data: json.players || [] };
    } catch (e) { return { success: false, error: e.message, data: [] }; }
  }
  // Managed roster ("Add Players" on the landing screen) → [{ id, name }]
  async getRummyRosterPlayers() {
    try {
      const json = await this.request('/rummy/roster');
      return { success: true, data: json.players || [] };
    } catch (e) { return { success: false, error: e.message, data: [] }; }
  }
  async addRummyRosterPlayer(name) {
    try {
      const json = await this.request('/rummy/roster', { method: 'POST', body: { name } });
      return { success: true, data: json.player };
    } catch (e) { return { success: false, error: e.message }; }
  }
  async deleteRummyRosterPlayer(id) {
    try {
      await this.request(`/rummy/roster/${id}`, { method: 'DELETE' });
      return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
  }

  // Single player (incl. team + stats JSON).
  async getPlayer(id) {
    try {
      const json = await this.request(`/players/${id}`);
      return { success: true, data: json.player };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createPlayer(playerData) {
    try {
      const json = await this.request('/players', { method: 'POST', body: playerData });
      return { success: true, data: json.player };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ── Push registration ──
  // Hand the device's FCM token to the backend so match/award notifications
  // can reach it. Called after notification permission is granted and again
  // whenever FCM rotates the token.
  async registerDevice(token, platform = 'android') {
    try {
      const json = await this.request('/devices/register', { method: 'POST', body: { token, platform } });
      return { success: true, data: json.device };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Drop this device's token on sign-out so the next user doesn't get our pushes.
  async unregisterDevice(token) {
    try {
      await this.request('/devices/unregister', { method: 'POST', body: { token } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Find an existing app user by mobile number (to add them to a team).
  async searchUserByPhone(phone) {
    try {
      const json = await this.request('/users/search?phone=' + encodeURIComponent(phone));
      return { success: true, data: json.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Scoring System - detailed ball-by-ball
  async updateScore(matchId, scoreData) {
    try {
      const json = await this.request(`/matches/${matchId}/score`, { method: 'PUT', body: scoreData });
      return { success: true, data: json.ball || scoreData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ── Ball Intelligence ──────────────────────────────────────────────────────
  // Where a delivery went. Sent AFTER the ball is stored and deliberately not
  // part of updateScore: shot capture is analytics over the scoring engine and
  // must never be able to fail a delivery. Callers go through utils/shotQueue,
  // which retries — this method just reports what happened and never throws.
  //
  // `code` is passed back out because the queue needs to tell "no signal, keep
  // it" apart from "that ball was undone, drop it" (BALL_GONE).
  async recordShot(matchId, shot) {
    try {
      const json = await this.request(`/matches/${matchId}/intelligence`, { method: 'POST', body: shot });
      return { success: true, data: json.intelligence, commentary: json.commentary };
    } catch (error) {
      // 400/403/404 will never become a 200 on a later try: a malformed shot, a
      // scorer who no longer holds the match, or a delivery that is gone. Anything
      // else (timeout, 5xx, no signal) is worth keeping in the queue.
      return {
        success: false,
        error: error.message,
        code: error.code,
        permanent: [400, 403, 404].includes(error.status),
      };
    }
  }

  // Every shot stored for a match — the wagon wheel, the spectator's live shot
  // and the match summary all read this. Public: a spectator is not a scorer.
  async getMatchIntelligence(matchId, { playerId, inningId } = {}) {
    try {
      const q = new URLSearchParams();
      if (playerId) q.set('playerId', playerId);
      if (inningId) q.set('inningId', inningId);
      const qs = q.toString();
      const json = await this.request(`/matches/${matchId}/intelligence${qs ? `?${qs}` : ''}`);
      return {
        success: true, enabled: json.enabled, shots: json.shots || [],
        summary: json.summary || null, latest: json.latest || null,
      };
    } catch (error) {
      return { success: false, error: error.message, shots: [] };
    }
  }

  // MY shot profile. Separate from getPlayerShots(id) because a user holds a
  // Player row per team and this spans all of them — the same set /me/stats
  // uses, so the two halves of My Stats describe the same player.
  async getMyShots(sport) {
    try {
      const json = await this.request('/users/me/shots' + this._sportQs(sport));
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // A batter's whole recorded shot history + the strengths/weaknesses read off
  // it. Separate from getPlayerCareer because this covers only the deliveries
  // somebody chose to capture, which is a much thinner slice than a career.
  async getPlayerShots(playerId) {
    try {
      const json = await this.request(`/players/${playerId}/shots`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Activity feed (milestone/result cards) — cursor-paginated.
  async getFeed({ sport, cursor, limit } = {}) {
    try {
      const q = new URLSearchParams();
      if (sport) q.set('sport', sport);
      if (cursor) q.set('cursor', cursor);
      if (limit) q.set('limit', String(limit));
      const json = await this.request(`/feed?${q.toString()}`);
      return { success: true, data: json.feed || [], nextCursor: json.nextCursor, hasMore: json.hasMore };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Idempotent like toggle on a feed card → { liked, likes }.
  async toggleFeedLike(feedId) {
    try {
      const json = await this.request(`/feed/${feedId}/like`, { method: 'POST' });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Resume-state projection — rebuilds live scoring state (striker/bowler/over)
  // from the server so a new device or reopened app can continue a match.
  async getLiveState(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/live-state`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Match awards (MVP): Man of the Match, Fighter, Best Batter/Bowler/Fielder.
  // Throw away a second innings that was started by accident. Refuses (409,
  // INNINGS_NOT_EMPTY) once it has deliveries in it.
  async discardInnings(matchId, inningId) {
    try {
      const json = await this.request(`/matches/${matchId}/innings/${inningId}`, { method: 'DELETE' });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMatchAwards(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/awards`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Indian city/town → district/state/pincode autocomplete.
  async searchPincodes(q) {
    try {
      const json = await this.request(`/pincodes/search?q=${encodeURIComponent(q)}`);
      return { success: true, data: json.results || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // Photo gallery (player or team).
  async getGallery({ userId, teamId } = {}) {
    try {
      const q = new URLSearchParams();
      if (userId) q.set('userId', userId);
      if (teamId) q.set('teamId', teamId);
      const json = await this.request(`/gallery?${q.toString()}`);
      return { success: true, data: json.photos || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async addGalleryPhoto({ url, caption, teamId } = {}) {
    try {
      const json = await this.request('/gallery', { method: 'POST', body: { url, caption, teamId } });
      return { success: true, data: json.photo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteGalleryPhoto(id) {
    try {
      await this.request(`/gallery/${id}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Upload a (base64) image to the Vercel Blob store → returns the public URL.
  // folder ∈ avatars | feed | gallery | marketplace | teams.
  async uploadImage({ folder, dataBase64, contentType = 'image/jpeg' }) {
    try {
      const json = await this.request('/upload', { method: 'POST', body: { folder, dataBase64, contentType } });
      return { success: true, url: json.url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Scorer info — current scorer + registered squad members you can transfer to.
  async getScorerInfo(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/scorer`);
      return { success: true, isScorer: json.isScorer, scorerId: json.scorerId, scorerName: json.scorerName || '', candidates: json.candidates || [] };
    } catch (error) {
      return { success: false, error: error.message, candidates: [] };
    }
  }

  // Transfer scoring rights to another user.
  async transferScorer(matchId, scorerId) {
    try {
      await this.request(`/matches/${matchId}/scorer`, { method: 'PUT', body: { scorerId } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Add a player from the team's roster to a live match's squad (playing XI).
  async addMatchPlayer(matchId, { playerId, teamId }) {
    try {
      const json = await this.request(`/matches/${matchId}/squad`, { method: 'POST', body: { playerId, teamId } });
      return { success: true, player: json.player };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Persist the live crease + bowler on the inning so a resumed match restores the
  // exact pair/bowler even before a ball is bowled. Fire-and-forget from the UI.
  async saveCrease(matchId, { inningId, strikerId, nonStrikerId, currentBowlerId }) {
    try {
      await this.request(`/matches/${matchId}/crease`, {
        method: 'PUT',
        body: { inningId, strikerId, nonStrikerId, currentBowlerId },
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get deep scorecard for a Match
  async getScorecard(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/scorecard`);
      return { success: true, data: json.match || null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Headline live score — small, cacheable, and computed by the same server
  // function that feeds the broadcast overlay, so the two can never disagree.
  // Poll this; fetch the full scorecard only when a tab needs it.
  async getLiveSummary(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/live-summary`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Is this match being telecast right now, and is it a verified broadcast?
  // Public — a live telecast is public by definition, so this needs no token.
  async getMatchBroadcast(matchId) {
    try {
      const json = await this.request(`/broadcast/matches/${matchId}/public`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament Management
  async createTournament(tournamentData) {
    try {
      const json = await this.request('/tournaments', { method: 'POST', body: { ...tournamentData, status: tournamentData.status || 'upcoming' } });
      return { success: true, data: json.tournament };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // News Feed
  async getCricketNews(sport) {
    try {
      const json = await this.request('/news' + this._sportQs(sport));
      // server returns { news: [...] }
      return { success: true, data: json.news || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ── Grounds Directory ───────────────────────────────────────────────
  async getGrounds(params = {}) {
    const qs = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');
    const path = `/grounds${qs ? '?' + qs : ''}`;
    try {
      const json = await this.request(path);
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getGroundDetail(id) {
    try {
      const json = await this.request(`/grounds/${id}`);
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async submitGroundRequest(data) {
    try {
      const json = await this.request('/grounds', {
        method: 'POST',
        body: data,
      });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async toggleGroundFavourite(id) {
    try {
      const json = await this.request(`/grounds/${id}/favourite`, { method: 'POST' });
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getGroundFavourites() {
    try {
      const json = await this.request('/grounds/user/favourites');
      return { success: true, data: json.grounds || [] };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async addGroundReview(id, data) {
    try {
      const json = await this.request(`/grounds/${id}/review`, {
        method: 'POST',
        body: data,
      });
      return { success: true, data: json.review };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getGroundReviews(id) {
    try {
      const json = await this.request(`/grounds/${id}/reviews`);
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Admin methods
  // scope 'review' (default) = grounds nobody has vouched for yet.
  // scope 'all' = every ground, so a verified one can still be reached to stop
  // its bookings — verifying removes it from the review list.
  async getGroundRequests(scope = 'review') {
    try {
      const json = await this.request(`/grounds/admin/requests${scope === 'all' ? '?scope=all' : ''}`);
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async approveGround(id) {
    try {
      const json = await this.request(`/grounds/${id}/approve`, { method: 'POST' });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Admin only, and deliberately separate from approving. Verifying says the
  // ground is real; this says whoever listed it may take bookings for it —
  // the claim worth checking, because that is the one a scammer wants. Pass
  // false to switch bookings off again without removing the listing.
  async setGroundBooking(id, enabled = true) {
    try {
      const json = await this.request(`/grounds/${id}/booking`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async rejectGround(id, reason) {
    try {
      const json = await this.request(`/grounds/${id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async requestGroundChanges(id, reason) {
    try {
      const json = await this.request(`/grounds/${id}/request-changes`, {
        method: 'POST',
        body: { reason },
      });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async suspendGround(id, reason) {
    try {
      const json = await this.request(`/grounds/${id}/suspend`, {
        method: 'POST',
        body: { reason },
      });
      return { success: true, data: json.ground };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Legacy Ground Booking
  async getAvailableGrounds() {
    try {
      const json = await this.request('/grounds');
      return { success: true, data: json.grounds || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async bookGround(groundId, date, slot) {
    try {
      const json = await this.request('/grounds/book', {
        method: 'POST',
        body: { groundId, date, slot },
      });
      return { success: true, data: json.booking };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Premium Features
  async getPremiumFeatures() {
    // Premium features are static for now (no payment gateway integrated)
    return {
      success: true,
      data: [
        { id: '1', name: 'Advanced Analytics', description: 'Detailed player and match analytics', price: 299, duration: 'monthly' },
        { id: '2', name: 'Live Streaming', description: 'Stream matches to followers', price: 499, duration: 'monthly' },
      ],
    };
  }

  // ── Authentication ──────────────────────────────────────────────────

  // Send OTP to mobile number
  async sendOtp(phone, countryCode = '+91') {
    try {
      const json = await this.request('/auth/send-otp', {
        method: 'POST',
        body: { phone, countryCode },
      });
      return { success: true, message: json.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Verify OTP and login (auto-registers new users)
  async verifyOtp(phone, otp, countryCode = '+91') {
    try {
      const json = await this.request('/auth/verify-otp', {
        method: 'POST',
        body: { phone, otp, countryCode },
      });
      await this.setToken(json.token);
      return {
        success: true,
        data: { ...json.user, token: json.token },
        isNewUser: json.isNewUser,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Signup with full details
  async signup(signupData) {
    try {
      const json = await this.request('/auth/signup', {
        method: 'POST',
        body: signupData,
      });
      await this.setToken(json.token);
      return { success: true, data: { ...json.user, token: json.token } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Email + password login
  async login(credentials) {
    try {
      const json = await this.request('/auth/login', { method: 'POST', body: credentials });
      // store token for subsequent requests
      await this.setToken(json.token);
      return { success: true, data: { ...json.user, token: json.token } };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Match update (status, result, score strings)
  async updateMatch(matchId, data) {
    try {
      const json = await this.request(`/matches/${matchId}`, { method: 'PUT', body: data });
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Create second inning
  async createInning(matchId, data) {
    try {
      const json = await this.request(`/matches/${matchId}/innings`, { method: 'POST', body: data });
      return { success: true, data: json.inning };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Undo the last scored delivery of an inning
  async undoLastBall(matchId, inningId) {
    try {
      const json = await this.request(`/matches/${matchId}/score/last?inningId=${encodeURIComponent(inningId)}`, { method: 'DELETE' });
      return { success: true, data: json.undone };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Mark the last delivery an accidental short run: server docks exactly 1 run.
  async shortenLastBall(matchId, inningId) {
    try {
      const json = await this.request(`/matches/${matchId}/score/last/short`, { method: 'PUT', body: { inningId } });
      return { success: true, awarded: json.awarded };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // One transactional call from Toss & Lineup: records the toss, fixes
  // inning 1's batting/bowling teams, and persists both playing XIs.
  async submitToss(matchId, data) {
    try {
      const json = await this.request(`/matches/${matchId}/toss`, { method: 'POST', body: data });
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update a tournament (e.g. Start: upcoming → ongoing)
  async updateTournament(id, data) {
    try {
      const json = await this.request(`/tournaments/${id}`, { method: 'PUT', body: data });
      return { success: true, data: json.tournament };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get innings for a match
  async getMatchInnings(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/innings`);
      return { success: true, data: json.innings || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Team update
  async updateTeam(teamId, data) {
    try {
      const json = await this.request(`/teams/${teamId}`, { method: 'PUT', body: data });
      return { success: true, data: json.team };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get single team
  async getTeam(teamId) {
    try {
      const json = await this.request(`/teams/${teamId}`);
      return { success: true, data: json.team };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Full team-profile bundle for the Team Profile screen: team, members, recent
  // matches, stats, same-sport leaderboard, gallery, achievements + awards.
  async getTeamProfile(teamId) {
    try {
      const json = await this.request(`/teams/${teamId}/profile`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Edit a squad member — role, jersey number, captain/vice-captain (admin only).
  async updatePlayer(playerId, data) {
    try {
      const json = await this.request(`/players/${playerId}`, { method: 'PUT', body: data });
      return { success: true, data: json.player };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Remove a player from a team's squad (team admin only).
  async deletePlayer(playerId) {
    try {
      await this.request(`/players/${playerId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Leave a team — the current user removes themselves from a team's squad.
  async leaveTeam(teamId) {
    try {
      await this.request(`/teams/${teamId}/leave`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Promote/demote a member as a team admin (team admins only).
  async setTeamMemberAdmin(teamId, playerId, isAdmin) {
    try {
      await this.request(`/teams/${teamId}/members/${playerId}/admin`, { method: 'PUT', body: { isAdmin } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Transfer team ownership to another member (owner only).
  async transferTeamOwner(teamId, userId) {
    try {
      await this.request(`/teams/${teamId}/transfer-owner`, { method: 'POST', body: { userId } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Delete a team (owner only; refused if it has match history).
  async deleteTeam(teamId) {
    try {
      await this.request(`/teams/${teamId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Open (or create) the team's group chat. Returns { chatRoomId, name } for
  // navigating to the shared Chat screen. Team members only.
  async openTeamChat(teamId) {
    try {
      const json = await this.request(`/teams/${teamId}/chat`, { method: 'POST' });
      return { success: true, chatRoomId: json.chatRoomId, name: json.name };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Request to join a team (creates a pending request for admins to approve).
  async requestToJoinTeam(teamId, note) {
    try {
      await this.request(`/teams/${teamId}/join-requests`, { method: 'POST', body: { note } });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Approve / reject a pending join request (team admins only).
  async approveTeamJoinRequest(teamId, userId) {
    try {
      await this.request(`/teams/${teamId}/join-requests/${userId}/approve`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async rejectTeamJoinRequest(teamId, userId) {
    try {
      await this.request(`/teams/${teamId}/join-requests/${userId}/reject`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Match photos — added from a finished match, fanned out to both teams'
  // galleries so they show up on each team's profile.
  async getMatchPhotos(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/photos`);
      return { success: true, data: json.photos || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async addMatchPhoto(matchId, { url, caption } = {}) {
    try {
      const json = await this.request(`/matches/${matchId}/photos`, { method: 'POST', body: { url, caption } });
      return { success: true, data: json.photos || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Club Management
  async getClubs(sport) {
    try {
      const json = await this.request('/clubs' + this._sportQs(sport));
      return { success: true, data: json.clubs || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async getClub(clubId) {
    try {
      const json = await this.request(`/clubs/${clubId}`);
      return { success: true, data: json.club };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createClub(clubData) {
    try {
      const json = await this.request('/clubs', { method: 'POST', body: clubData });
      return { success: true, data: json.club };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async updateClub(clubId, data) {
    try {
      const json = await this.request(`/clubs/${clubId}`, { method: 'PUT', body: data });
      return { success: true, data: json.club };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Chat/Social Features (polling-based)
  async getChatRooms() {
    try {
      const json = await this.request('/chat/rooms');
      return { success: true, data: json.rooms || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async createChatRoom(name, type, memberIds) {
    try {
      const json = await this.request('/chat/rooms', { method: 'POST', body: { name, type, memberIds } });
      return { success: true, data: json.room };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getChatMessages(roomId, after) {
    try {
      const query = after ? `?after=${encodeURIComponent(after)}` : '';
      const json = await this.request(`/chat/rooms/${roomId}/messages${query}`);
      return { success: true, data: json.messages || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async sendChatMessage(roomId, text) {
    try {
      const json = await this.request(`/chat/rooms/${roomId}/messages`, { method: 'POST', body: { text } });
      return { success: true, data: json.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Live Streaming APIs
  async getLiveStreams(sport) {
    try {
      const json = await this.request('/streams' + this._sportQs(sport));
      const streams = (json.streams || []).filter(s => s.status === 'live');
      return { success: true, data: streams };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUpcomingStreams() {
    try {
      const json = await this.request('/streams');
      const streams = (json.streams || []).filter(s => s.status === 'upcoming');
      return { success: true, data: streams };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createStream(streamData) {
    try {
      const json = await this.request('/streams', { method: 'POST', body: streamData });
      return { success: true, data: json.stream };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Video Analysis APIs
  async getMatchVideos() {
    try {
      const json = await this.request('/videos');
      return { success: true, data: json.videos || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async getVideoAnalyses() {
    try {
      const json = await this.request('/videos/analyses/all');
      return { success: true, data: json.analyses || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async uploadVideo(videoData) {
    try {
      const json = await this.request('/videos', { method: 'POST', body: videoData });
      return { success: true, data: json.video };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async analyzeVideo(videoId) {
    try {
      const json = await this.request(`/videos/${videoId}/analyze`, { method: 'POST' });
      return { success: true, data: json.analysis };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Quiz APIs
  async getDailyQuiz() {
    try {
      const json = await this.request('/quizzes/daily');
      return { success: true, data: json.quiz || json };
    } catch (error) {
      return { success: true, data: null };
    }
  }

  async submitQuiz(quizId, answers) {
    try {
      const json = await this.request('/quizzes/submit', { method: 'POST', body: { quizId, answers } });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Profile APIs
  async getUserProfile(sport) {
    try {
      if (!this.token) return { success: true, data: {} };
      // Scoped when a sport is given: a user can hold a player row per sport,
      // and the unscoped lookup returns whichever comes first — so a
      // footballer's profile could describe them as a right-arm quick.
      const json = await this.request(`/users/me${sport ? `?sport=${encodeURIComponent(sport)}` : ''}`);
      // `player` rides along: /users/me has always returned it, and the profile
      // screen needs its id to save how this person bats and bowls — those
      // belong to the player, not the account.
      // `teams` is every club this person turns out for — a Player row is a
      // team membership, so someone in three clubs has three of them.
      return { success: true, data: json.user, player: json.player || null, teams: json.teams || [], sports: json.sports || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // How I play: primary role, batting hand, bowling style. Separate from
  // updateUserProfile because these describe the PLAYER, not the account — and
  // separate from updatePlayer() because that one needs an id and team-admin
  // rights, neither of which a first-time user has. Creates the player row if
  // this is the first time they've said they play.
  async saveMyPlayer({ sport = 'cricket', role, battingStyle, bowlingStyle }) {
    try {
      const json = await this.request('/users/me/player', {
        method: 'PUT', body: { sport, role, battingStyle, bowlingStyle },
      });
      return { success: true, data: json.player };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Update the logged-in user's profile (firstName / lastName / bio / avatarUrl).
  async updateUserProfile(data) {
    try {
      const json = await this.request('/users/me', { method: 'PUT', body: data });
      return { success: true, data: json.user };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Logged-in user + their linked player profile (name/role/team/stats).
  async getMe() {
    if (!this.token) return { success: false, error: 'Not logged in' };
    try {
      const json = await this.request('/users/me');
      setEntitlements(json.entitlements);  // refresh free/pro feature gates
      return { success: true, data: json };  // { user, player, sports, entitlements }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Record the user's active/primary sport (e.g. from the Arena picker).
  async selectPrimarySport(sport) {
    if (!this.token) return { success: false, error: 'Not logged in' };
    try {
      const json = await this.request('/users/me/primary-sport', { method: 'POST', body: { sport } });
      return { success: true, data: json.sports || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getUserStats(sport) {
    try {
      if (!this.token) return { success: true, data: {} };
      const json = await this.request('/users/me/stats' + this._sportQs(sport));
      return { success: true, data: json.stats || json };
    } catch (error) {
      return { success: true, data: { matches: 0, runs: 0, wickets: 0, average: 0, strikeRate: 0, centuries: 0, halfCenturies: 0 } };
    }
  }

  // Badge APIs
  async getUserBadges() {
    try {
      const json = await this.request('/badges');
      return { success: true, data: json.badges || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async getAvailableBadges() {
    try {
      const json = await this.request('/badges');
      return { success: true, data: json.badges || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async getBadgeLeaderboard() {
    try {
      const json = await this.request('/badges/leaderboard');
      return { success: true, data: json.leaderboard || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // Marketplace APIs
  async getMarketplaceProducts(sport) {
    try {
      const json = await this.request('/marketplace/products' + this._sportQs(sport));
      return { success: true, data: json.products || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createMarketplaceProduct(product) {
    try {
      const json = await this.request('/marketplace/products', { method: 'POST', body: product });
      return { success: true, data: json.product };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMarketplaceCategories() {
    const categories = [
      {id: 'equipment', name: 'Equipment', icon: '🏏'},
      {id: 'services', name: 'Services', icon: '🎯'},
      {id: 'apparel', name: 'Apparel', icon: '👕'},
      {id: 'accessories', name: 'Accessories', icon: '🧤'}
    ];
    
    return { success: true, data: categories };
  }

  // /players/:id/insights has no caller. It fed PlayerInsightsScreen, which was
  // retired because it computed cricket a third way — a two-ball over counted as
  // a whole over — while CareerBoard reads the same career as My Stats. The
  // backend route is still there; re-add a client for it only alongside a
  // computation that agrees with playerCareer.js.

  // One player's career in the SAME shape as getUserStats — same endpoint family,
  // same computation (backend lib/playerCareer.js) — so a tapped player and My
  // Stats draw from identical data through the same CareerBoard.
  async getPlayerCareer(playerId) {
    try {
      const json = await this.request(`/players/${playerId}/career`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament listing
  async getTournaments(params = {}) {
    try {
      const qs = Object.entries(params).filter(([, v]) => v)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      const json = await this.request('/tournaments' + (qs ? `?${qs}` : ''));
      return { success: true, data: json.tournaments || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  async getTournament(id) {
    try {
      const json = await this.request(`/tournaments/${id}`);
      return { success: true, data: json.tournament };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Get single product
  async getMarketplaceProduct(productId) {
    try {
      const json = await this.request(`/marketplace/products/${productId}`);
      return { success: true, data: json.product };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Team → Stats. One call for every number on the tab; `filters` is
  // { from, to, matchType, venue, tournamentId } and any of them may be absent.
  async getTeamStats(teamId, filters = {}) {
    try {
      const qs = Object.entries(filters)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      const json = await this.request(`/teams/${teamId}/stats${qs ? `?${qs}` : ''}`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // The values the filters should offer, from this team's own matches.
  // A tournament's full board set. No filters — see TeamStatLeaderboardScreen.
  async getTournamentStats(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/stats`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message, data: { leaderboards: {} } };
    }
  }

  async getTeamStatsOptions(teamId) {
    try {
      const json = await this.request(`/teams/${teamId}/stats/options`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message, data: { years: [], matchTypes: [], venues: [], tournaments: [] } };
    }
  }


  // Single match detail
  async getMatch(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}`);
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Match insights (batting/bowling analytics)
  async getMatchInsights(matchId) {
    try {
      const json = await this.request(`/matches/${matchId}/insights`);
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — points table
  async getTournamentPointsTable(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/points-table`);
      return { success: true, data: json.pointsTable || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — computed standings (Module 2 engine: points + per-sport
  // tiebreakers NRR/Goal-Diff/… from recorded results).
  async getTournamentStandings(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/standings`);
      // `stages` is one table per stage; `standings` is the whole tournament as
      // one. A tournament with a group phase and a Super 8 only makes sense as
      // the former, so it rides along for callers that can use it.
      return { success: true, data: json.standings || [], stages: json.stages || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — report a fixture result (marks it completed, recomputes the
  // points table, and advances any knockout/bracket placeholders).
  // result = { tmId, winnerTeamId?, resultKind, stats: { [teamId]: {scored, conceded, oversFaced?, oversBowled?} } }
  async reportTournamentResult(tournamentId, result) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/result`, { method: 'POST', body: result });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — link a real (ball-by-ball) match to a fixture when scoring
  // starts; the fixture goes live and auto-completes when the match finishes.
  async linkTournamentFixtureMatch(tournamentId, tmId, matchId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/fixtures/${tmId}/match`, { method: 'PUT', body: { matchId } });
      return { success: true, data: json.fixture };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — leaderboard (Orange Cap / Purple Cap / MVP from ball-by-ball data)
  async getTournamentLeaderboard(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/leaderboard`);
      // `awards` = the series honours (Player of the Series, best batter /
      // bowler / fielder). `mvp` is the older fantasy-points list it replaced.
      return {
        success: true,
        data: {
          batsmen: json.batsmen || [], bowlers: json.bowlers || [],
          mvp: json.mvp || [], awards: json.awards || [],
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — schedule/fixtures
  async getTournamentSchedule(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/schedule`);
      return { success: true, data: json.schedule || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — register a team or player
  async registerTeamInTournament(tournamentId, arg2, group = 'A') {
    let body;
    if (typeof arg2 === 'object' && arg2 !== null) {
      body = { ...arg2, group };
    } else {
      body = { participantType: 'TEAM', teamId: arg2, group };
    }

    try {
      // Preserve backward compatibility for team records by using the legacy endpoint
      const endpoint = (body.participantType === 'PLAYER') 
        ? `/tournaments/${tournamentId}/participants` 
        : `/tournaments/${tournamentId}/teams`;
        
      const json = await this.request(endpoint, { method: 'POST', body });
      return { success: true, data: json.entry };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — remove a team
  async removeTeamFromTournament(tournamentId, teamId) {
    try {
      await this.request(`/tournaments/${tournamentId}/teams/${teamId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — a participant requests to join (creates a pending request)
  async requestToJoinTournament(tournamentId, arg2, group = 'A', note = null) {
    let body;
    if (typeof arg2 === 'object' && arg2 !== null) {
      // If the caller uses the new API, they might pass note as the 3rd argument (group) 
      // by mistake if they skip group, so handle it carefully if they omit group
      if (group !== 'A' && note === null) {
        body = { ...arg2, note: group }; // fallback for caller passing (id, payload, note)
      } else {
        body = { ...arg2, group, note };
      }
    } else {
      body = { participantType: 'TEAM', teamId: arg2, group, note };
    }

    try {
      const json = await this.request(`/tournaments/${tournamentId}/join-requests`, { method: 'POST', body });
      return { success: true, data: json.entry };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — pending join requests (organiser only)
  async getTournamentJoinRequests(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/join-requests`);
      return { success: true, data: json.requests || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — approve / reject a pending request (organiser only)
  async approveJoinRequest(tournamentId, teamId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/join-requests/${teamId}/approve`, { method: 'POST' });
      return { success: true, data: json.entry };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // The caller's own join requests for a tournament (the requester's side —
  // /join-requests is organiser-only).
  async getMyJoinRequests(tournamentId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/my-requests`);
      return { success: true, data: json.requests || [] };
    } catch (error) {
      return { success: true, data: [] };
    }
  }

  // Open (or start) the requester↔organiser conversation about a request.
  // Returns { chatRoomId, name } for navigating to the shared Chat screen.
  async openJoinRequestChat(tournamentId, teamId) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/join-requests/${teamId}/chat`, { method: 'POST' });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async rejectJoinRequest(tournamentId, teamId) {
    try {
      await this.request(`/tournaments/${tournamentId}/join-requests/${teamId}/reject`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — add fixture
  async addTournamentFixture(tournamentId, fixtureData) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/schedule`, { method: 'POST', body: fixtureData });
      return { success: true, data: json.match };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Tournament — auto schedule Round Robin
  async autoScheduleTournament(tournamentId, params = { format: 'classic_t20', autoSplit: true }) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/auto-schedule`, { method: 'POST', body: params });
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Tournament — assign groups manually
  async assignTournamentGroups(tournamentId, assignments) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/assign-groups`, {
        method: 'PUT',
        body: { assignments }
      });
      return { success: true, data: json };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // Looking For posts
  // Returns one page plus the board-wide chip counts and the next cursor.
  async getLookingForPosts(filters = {}) {
    try {
      const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null && v !== ''));
      const params = new URLSearchParams(clean).toString();
      const json = await this.request(`/looking-for${params ? `?${params}` : ''}`);
      return {
        success: true,
        data: json.posts || [],
        counts: json.counts || {},
        total: json.total || 0,
        nextCursor: json.nextCursor || null,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async createLookingFor(data) {
    try {
      const json = await this.request('/looking-for', { method: 'POST', body: data });
      return { success: true, data: json.post };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Takes a status string (close/fill) or a partial listing to edit.
  async updateLookingFor(postId, patch) {
    try {
      const body = typeof patch === 'string' ? { status: patch } : patch;
      const json = await this.request(`/looking-for/${postId}`, { method: 'PUT', body });
      return { success: true, data: json.post };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async deleteLookingFor(postId) {
    try {
      await this.request(`/looking-for/${postId}`, { method: 'DELETE' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Scout "Connect" flow — request → poster accepts → chat unlocks.
  async connectLookingFor(postId) {
    try {
      const json = await this.request(`/looking-for/${postId}/connect`, { method: 'POST', body: {} });
      return { success: true, data: json.connection };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getLookingForConnections() {
    try {
      const json = await this.request('/looking-for/connections');
      return { success: true, data: json.connections || [] };
    } catch (error) {
      return { success: false, error: error.message, data: [] };
    }
  }

  async respondLookingForConnection(connectionId, action) {
    try {
      const json = await this.request(`/looking-for/connections/${connectionId}`, { method: 'PUT', body: { action } });
      return { success: true, data: json.connection };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Open (or start) the chat about a connect request — either party, at any
  // status. The room used to exist only after an accept.
  async openLookingForChat(connectionId) {
    try {
      const json = await this.request(`/looking-for/connections/${connectionId}/chat`, { method: 'POST' });
      return { success: true, data: json };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Coaching
  async getCoaches(filters = {}) {
    try {
      const params = new URLSearchParams(filters).toString();
      const json = await this.request(`/coaching${params ? `?${params}` : ''}`);
      return { success: true, data: json.coaches || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getCoach(coachId) {
    try {
      const json = await this.request(`/coaching/${coachId}`);
      return { success: true, data: json.coach };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bookCoach(coachId, date, duration = 1, notes) {
    try {
      const json = await this.request('/coaching/book', { method: 'POST', body: { coachId, date, duration, notes } });
      return { success: true, data: json.booking };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMyCoachBookings() {
    try {
      const json = await this.request('/coaching/bookings/mine');
      return { success: true, data: json.bookings || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Umpires
  async getUmpires(filters = {}) {
    try {
      const params = new URLSearchParams(filters).toString();
      const json = await this.request(`/umpires${params ? `?${params}` : ''}`);
      return { success: true, data: json.umpires || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async registerUmpire(data) {
    try {
      const json = await this.request('/umpires/register', { method: 'POST', body: data });
      return { success: true, data: json.umpire };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Scorers
  async getScorers(filters = {}) {
    try {
      const params = new URLSearchParams(filters).toString();
      const json = await this.request(`/scorers${params ? `?${params}` : ''}`);
      return { success: true, data: json.scorers || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async bookScorer(scorerId, matchDate, venue) {
    try {
      const json = await this.request('/scorers/book', { method: 'POST', body: { scorerId, matchDate, venue } });
      return { success: true, data: json.booking };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getMyScoreBookings() {
    try {
      const json = await this.request('/scorers/bookings/mine');
      return { success: true, data: json.bookings || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Notification APIs
  // Paged, newest first. `unread` is the true server-side count (the loaded
  // page alone can't tell you that once there are more than `limit` unread).
  async getNotifications({ limit = 30, cursor } = {}) {
    try {
      if (!this.token) return { success: true, data: [], unread: 0, nextCursor: null };
      const qs = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
      const json = await this.request(`/notifications?${qs}`);
      return {
        success: true,
        data: json.notifications || [],
        nextCursor: json.nextCursor || null,
        unread: json.unread ?? 0,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async markNotificationAsRead(id) {
    try {
      if (!this.token) return { success: false, error: 'Not logged in' };
      await this.request(`/notifications/${id}/read`, { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async markAllNotificationsAsRead() {
    try {
      if (!this.token) return { success: false, error: 'Not logged in' };
      await this.request('/notifications/read-all', { method: 'POST' });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Search APIs
  async globalSearch(query) {
    try {
      const json = await this.request(`/search?q=${encodeURIComponent(query)}`);
      return { success: true, data: json.results || {} };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Help & Support APIs
  async getHelpFAQs() {
    // Static FAQs — no backend needed
    return {
      success: true,
      data: [
        { id: '1', question: 'How to create a team?', answer: 'Go to Team Management and tap "Create Team".', category: 'teams' },
        { id: '2', question: 'How to start scoring?', answer: 'Open a match and tap "Start Scoring".', category: 'scoring' },
        { id: '3', question: 'How to join a tournament?', answer: 'Go to Tournaments and tap "Join" on any open tournament.', category: 'tournaments' },
        { id: '4', question: 'How do OTP logins work?', answer: 'Enter your phone number, receive a 4-digit OTP, and verify to log in.', category: 'account' },
      ],
    };
  }

  async submitContactForm(formData) {
    // Static response — no ticket system yet
    return { success: true, data: { ticketId: Date.now().toString(), message: 'Your query has been submitted successfully' } };
  }
}

// Export singleton instance
const legendsApi = new LegendsApi();
export default legendsApi;
