#!/usr/bin/env node
// sim-cricket-match.mjs — end-to-end cricket scoring test against the live API.
//
// Creates two teams of 11 real-name players, plays a complete T10 match
// ball-by-ball through the same endpoints the app uses (toss → innings 1 →
// innings 2 chase → result), then pulls the scorecard back and verifies the
// API's innings totals against the simulator's own book-keeping.
//
//   node scripts/sim-cricket-match.mjs                 # against prod (Vercel)
//   API=http://localhost:4000 node scripts/sim-cricket-match.mjs
//
// Reuses the app's test login (OTP 1234) for the authed team-create calls.

const API = process.env.API || 'https://allin1-api.vercel.app';
const OVERS = 10;

// Deterministic RNG so failures are reproducible.
let seed = 20260702;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const req = async (path, { method = 'GET', body, token } = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
};

const TEAM_A = { name: 'Mumbai Mavericks', players: [
  ['Rohit Sharma', 'Batsman'], ['Shubman Gill', 'Batsman'], ['Virat Kohli', 'Batsman'],
  ['Suryakumar Yadav', 'Batsman'], ['Hardik Pandya', 'All Rounder'], ['Ravindra Jadeja', 'All Rounder'],
  ['Ishan Kishan', 'Wicket Keeper'], ['Washington Sundar', 'All Rounder'],
  ['Jasprit Bumrah', 'Bowler'], ['Mohammed Siraj', 'Bowler'], ['Kuldeep Yadav', 'Bowler'],
]};
const TEAM_B = { name: 'Chennai Chargers', players: [
  ['Ruturaj Gaikwad', 'Batsman'], ['Devon Conway', 'Batsman'], ['Rachin Ravindra', 'All Rounder'],
  ['Shivam Dube', 'All Rounder'], ['Ravichandran Ashwin', 'All Rounder'], ['MS Dhoni', 'Wicket Keeper'],
  ['Sam Curran', 'All Rounder'], ['Deepak Chahar', 'Bowler'],
  ['Shardul Thakur', 'Bowler'], ['Matheesha Pathirana', 'Bowler'], ['Maheesh Theekshana', 'Bowler'],
]};

// Weighted delivery outcomes (per legal-ish delivery).
function delivery() {
  const r = rnd();
  if (r < 0.04) return { type: 'wide' };
  if (r < 0.09) return { type: 'wicket' };
  if (r < 0.38) return { type: 'runs', runs: 0 };
  if (r < 0.66) return { type: 'runs', runs: 1 };
  if (r < 0.78) return { type: 'runs', runs: 2 };
  if (r < 0.80) return { type: 'runs', runs: 3 };
  if (r < 0.93) return { type: 'runs', runs: 4 };
  return { type: 'runs', runs: 6 };
}

// Simulate one innings ball-by-ball through PUT /matches/:id/score.
async function playInnings({ matchId, inningId, batting, bowling, target }) {
  const bowlers = bowling.slice(-5);              // last 5 in the XI bowl
  let striker = batting[0], nonStriker = batting[1], nextBat = 2;
  let runs = 0, wkts = 0, ballsSent = 0;
  const book = { batters: {}, bowlers: {} };      // simulator-side book-keeping

  for (let over = 1; over <= OVERS; over++) {
    const bowler = bowlers[(over - 1) % bowlers.length];
    let legal = 0, ballNo = 0;
    while (legal < 6) {
      const d = delivery();
      const ball = {
        inningId, overNumber: over, ballNumber: ++ballNo,
        bowlerId: bowler.id, batterId: striker.id, nonStrikerId: nonStriker.id,
        runs: 0, extras: 0, extraType: null,
        isWicket: false, wicketType: null, dismissedPlayerId: null,
      };
      if (d.type === 'wide') {
        ball.extras = 1; ball.extraType = 'wide';
        runs += 1;
      } else if (d.type === 'wicket') {
        ball.isWicket = true; ball.wicketType = rnd() < 0.5 ? 'bowled' : 'caught';
        ball.dismissedPlayerId = striker.id;
        legal++;
        book.bowlers[bowler.name] = book.bowlers[bowler.name] || { w: 0, r: 0 };
        book.bowlers[bowler.name].w++;
        wkts++;
      } else {
        ball.runs = d.runs;
        runs += d.runs;
        legal++;
        book.batters[striker.name] = (book.batters[striker.name] || 0) + d.runs;
        book.bowlers[bowler.name] = book.bowlers[bowler.name] || { w: 0, r: 0 };
        book.bowlers[bowler.name].r += d.runs;
      }

      await req(`/matches/${matchId}/score`, { method: 'PUT', body: ball });
      ballsSent++;

      if (ball.isWicket) {
        if (wkts >= 10 || nextBat >= batting.length) { legal = 6; over = OVERS + 1; break; }
        striker = batting[nextBat++];
      } else if (d.type !== 'wide' && d.runs % 2 === 1) {
        [striker, nonStriker] = [nonStriker, striker];
      }
      if (target && runs >= target) { over = OVERS + 1; break; }
    }
    [striker, nonStriker] = [nonStriker, striker];  // swap at over end
    if (target && runs >= target) break;
    if (wkts >= 10 || nextBat > batting.length) break;
  }
  return { runs, wkts, ballsSent, book };
}

(async () => {
  console.log(`▶ API: ${API}\n`);

  // 1) login (test OTP) for the authed team-create calls
  await req('/auth/send-otp', { method: 'POST', body: { phone: '9998887770', countryCode: '+91' } });
  const auth = await req('/auth/verify-otp', { method: 'POST', body: { phone: '9998887770', countryCode: '+91', otp: '1234' } });
  const token = auth.token;
  console.log('✓ logged in (test user 9998887770)');

  // 2) teams + 22 players
  const mk = async (def) => {
    const { team } = await req('/teams', { method: 'POST', token, body: { name: def.name } });
    const players = [];
    for (const [name, role] of def.players) {
      const { player } = await req('/players', { method: 'POST', body: { name, role, teamId: team.id, sport: 'cricket' } });
      players.push({ id: player.id, name });
    }
    console.log(`✓ ${def.name}: 11 players`);
    return { team, players };
  };
  const A = await mk(TEAM_A);
  const B = await mk(TEAM_B);

  // 3) match (T10) + inning 1
  const { match } = await req('/matches', { method: 'POST', body: {
    team1Id: A.team.id, team2Id: B.team.id, sport: 'cricket',
    matchType: 'T10', overs: OVERS, ballType: 'Leather', venue: 'Test Arena, Chennai',
  }});
  const { innings } = await req(`/matches/${match.id}/innings`);
  const inning1 = innings[0];
  console.log(`✓ match created ${match.id} (T10, Leather) — inning 1 ${inning1.id}`);

  // 4) toss: B wins, elects to bowl → A bats first. Persist both XIs.
  await req(`/matches/${match.id}/toss`, { method: 'POST', body: {
    tossWinnerId: B.team.id, tossDecision: 'bowl',
    battingTeamId: A.team.id, bowlingTeamId: B.team.id,
    squads: [
      { teamId: A.team.id, playerIds: A.players.map((p) => p.id) },
      { teamId: B.team.id, playerIds: B.players.map((p) => p.id) },
    ],
  }});
  console.log(`✓ toss: ${TEAM_B.name} won, elected to bowl — XIs persisted`);

  // 5) innings 1
  process.stdout.write(`▶ innings 1: ${TEAM_A.name} batting… `);
  const i1 = await playInnings({ matchId: match.id, inningId: inning1.id, batting: A.players, bowling: B.players });
  const s1 = `${i1.runs}/${i1.wkts}`;
  await req(`/matches/${match.id}`, { method: 'PUT', body: { score1: s1 } });
  console.log(`${s1} (${i1.ballsSent} deliveries sent)`);

  // 6) innings 2 (chase)
  const { inning: inning2 } = await req(`/matches/${match.id}/innings`, { method: 'POST', body: {
    battingTeamId: B.team.id, bowlingTeamId: A.team.id, targetScore: i1.runs + 1,
  }});
  process.stdout.write(`▶ innings 2: ${TEAM_B.name} chasing ${i1.runs + 1}… `);
  const i2 = await playInnings({ matchId: match.id, inningId: inning2.id, batting: B.players, bowling: A.players, target: i1.runs + 1 });
  const s2 = `${i2.runs}/${i2.wkts}`;
  console.log(`${s2} (${i2.ballsSent} deliveries sent)`);

  const result = i2.runs > i1.runs
    ? `${TEAM_B.name} won by ${10 - i2.wkts} wickets`
    : i2.runs === i1.runs ? 'Match tied'
    : `${TEAM_A.name} won by ${i1.runs - i2.runs} runs`;
  await req(`/matches/${match.id}`, { method: 'PUT', body: { score2: s2, status: 'completed', result } });
  console.log(`✓ result: ${result}\n`);

  // 7) VERIFY: scorecard totals vs simulator book-keeping
  const { match: card } = await req(`/matches/${match.id}/scorecard`);
  let pass = true;
  const check = (label, got, want) => {
    const ok = String(got) === String(want);
    if (!ok) pass = false;
    console.log(`  ${ok ? '✓' : '✗'} ${label}: api=${got} sim=${want}`);
  };
  console.log('▶ verification (API scorecard vs simulator):');
  check('inn1 runs',    card.innings[0].totalRuns,    i1.runs);
  check('inn1 wickets', card.innings[0].totalWickets, i1.wkts);
  check('inn2 runs',    card.innings[1].totalRuns,    i2.runs);
  check('inn2 wickets', card.innings[1].totalWickets, i2.wkts);
  check('squads persisted', card.squads.length, 22);
  check('balls persisted',
    card.innings.reduce((t, inn) => t + inn.oversData.reduce((o, ov) => o + ov.balls.length, 0), 0),
    i1.ballsSent + i2.ballsSent);

  // top performers from the API's ball data
  const bat = {}, bowl = {};
  for (const inn of card.innings) for (const ov of inn.oversData) {
    bowl[ov.bowler.name] = bowl[ov.bowler.name] || { w: 0, r: 0 };
    bowl[ov.bowler.name].w += ov.wickets; bowl[ov.bowler.name].r += ov.runs;
    for (const b of ov.balls) bat[b.batter.name] = (bat[b.batter.name] || 0) + b.runs;
  }
  const topBat = Object.entries(bat).sort((x, y) => y[1] - x[1])[0];
  const topBowl = Object.entries(bowl).sort((x, y) => y[1].w - x[1].w || x[1].r - y[1].r)[0];
  console.log(`\n  🏏 top scorer : ${topBat[0]} — ${topBat[1]} runs`);
  console.log(`  🎯 best bowler: ${topBowl[0]} — ${topBowl[1].w}/${topBowl[1].r}`);
  console.log(`\n${pass ? '✅ ALL CHECKS PASSED' : '❌ CHECKS FAILED'} — matchId ${match.id}`);
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('\n💥', e.message); process.exit(1); });
