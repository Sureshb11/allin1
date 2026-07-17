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
          throw new Error(err);
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
      return { success: true };
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
  async getTeamsCategorized() {
    try {
      const json = await this.request('/teams/categorized');
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

  async createPost({ sport = 'cricket', text, team, mediaUrl }) {
    try {
      const json = await this.request('/posts', { method: 'POST', body: { sport, text, team, mediaUrl } });
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
  async getCricketNews() {
    try {
      const json = await this.request('/news');
      // server returns { news: [...] }
      return { success: true, data: json.news || [] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Ground Booking
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
  async getClubs() {
    try {
      const json = await this.request('/clubs');
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
  async getLiveStreams() {
    try {
      const json = await this.request('/streams');
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
  async getUserProfile() {
    try {
      if (!this.token) return { success: true, data: {} };
      const json = await this.request('/users/me');
      return { success: true, data: json.user };
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

  async getUserStats() {
    try {
      if (!this.token) return { success: true, data: {} };
      const json = await this.request('/users/me/stats');
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
  async getMarketplaceProducts() {
    try {
      const json = await this.request('/marketplace/products');
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

  // Insights & Analytics APIs
  async getPlayerInsights(playerId) {
    try {
      const json = await this.request(`/players/${playerId}/insights`);
      return { success: true, data: json.insights || { performance: {}, statistics: {}, recommendations: [] } };
    } catch (error) {
      return { success: true, data: { performance: {}, statistics: {}, recommendations: [] } };
    }
  }

  // Tournament listing
  async getTournaments() {
    try {
      const json = await this.request('/tournaments');
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

  async getTeamInsights(teamId) {
    try {
      const json = await this.request(`/teams/${teamId}/insights`);
      return { success: true, data: json };
    } catch (error) {
      return { success: true, data: { stats: {}, form: [], topBatters: [], topBowlers: [] } };
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
      return { success: true, data: json.standings || [] };
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
      return { success: true, data: { batsmen: json.batsmen || [], bowlers: json.bowlers || [], mvp: json.mvp || [] } };
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

  // Tournament — register a team
  async registerTeamInTournament(tournamentId, teamId, group = 'A') {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/teams`, { method: 'POST', body: { teamId, group } });
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

  // Tournament — a team owner requests to join (creates a pending request)
  async requestToJoinTournament(tournamentId, teamId, group = 'A', note = null) {
    try {
      const json = await this.request(`/tournaments/${tournamentId}/join-requests`, { method: 'POST', body: { teamId, group, note } });
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
  async getLookingForPosts(filters = {}) {
    try {
      const params = new URLSearchParams(filters).toString();
      const json = await this.request(`/looking-for${params ? `?${params}` : ''}`);
      return { success: true, data: json.posts || [] };
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

  async updateLookingFor(postId, status) {
    try {
      const json = await this.request(`/looking-for/${postId}`, { method: 'PUT', body: { status } });
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
  async getNotifications() {
    try {
      if (!this.token) return { success: true, data: [] };
      const json = await this.request('/notifications');
      return { success: true, data: json.notifications || [] };
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
