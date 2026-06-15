import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // ── Teams ───────────────────────────────────────────────────────
  const team1 = await prisma.team.upsert({
    where: { id: 'seed-team1' },
    update: { name: 'Mumbai Indians' },
    create: { id: 'seed-team1', name: 'Mumbai Indians', city: 'Mumbai' },
  });
  const team2 = await prisma.team.upsert({
    where: { id: 'seed-team2' },
    update: { name: 'Chennai Super Kings' },
    create: { id: 'seed-team2', name: 'Chennai Super Kings', city: 'Chennai' },
  });
  const team3 = await prisma.team.upsert({
    where: { id: 'seed-team3' },
    update: { name: 'Royal Challengers Bangalore' },
    create: { id: 'seed-team3', name: 'Royal Challengers Bangalore', city: 'Bangalore' },
  });
  const team4 = await prisma.team.upsert({
    where: { id: 'seed-team4' },
    update: { name: 'Delhi Capitals' },
    create: { id: 'seed-team4', name: 'Delhi Capitals', city: 'Delhi' },
  });
  const team5 = await prisma.team.upsert({
    where: { id: 'seed-team5' },
    update: { name: 'Kolkata Knight Riders' },
    create: { id: 'seed-team5', name: 'Kolkata Knight Riders', city: 'Kolkata' },
  });

  // ── Players ─────────────────────────────────────────────────────
  const playersData = [
    { name: 'Rohit Sharma', role: 'Batsman', teamId: team1.id, stats: { matches: 243, runs: 10000, average: 48.5, strikeRate: 140.1 } },
    { name: 'Jasprit Bumrah', role: 'Bowler', teamId: team1.id, stats: { matches: 120, wickets: 145, average: 24.2, economy: 7.4 } },
    { name: 'Suryakumar Yadav', role: 'Batsman', teamId: team1.id, stats: { matches: 95, runs: 3200, average: 44.2, strikeRate: 168.3 } },
    { name: 'MS Dhoni', role: 'Wicket-keeper', teamId: team2.id, stats: { matches: 250, runs: 5100, average: 38.2, strikeRate: 135.0 } },
    { name: 'Ravindra Jadeja', role: 'All-rounder', teamId: team2.id, stats: { matches: 210, runs: 2800, wickets: 155, average: 30.0 } },
    { name: 'Ruturaj Gaikwad', role: 'Batsman', teamId: team2.id, stats: { matches: 70, runs: 2500, average: 42.5, strikeRate: 132.0 } },
    { name: 'Virat Kohli', role: 'Batsman', teamId: team3.id, stats: { matches: 237, runs: 7263, average: 37.2, strikeRate: 130.7 } },
    { name: 'Glenn Maxwell', role: 'All-rounder', teamId: team3.id, stats: { matches: 110, runs: 2200, wickets: 25, average: 28.0 } },
    { name: 'Rishabh Pant', role: 'Wicket-keeper', teamId: team4.id, stats: { matches: 98, runs: 3000, average: 35.5, strikeRate: 150.2 } },
    { name: 'Axar Patel', role: 'All-rounder', teamId: team4.id, stats: { matches: 80, runs: 1200, wickets: 60, average: 25.0 } },
    { name: 'Sunil Narine', role: 'All-rounder', teamId: team5.id, stats: { matches: 164, wickets: 163, runs: 1100, economy: 6.7 } },
    { name: 'Andre Russell', role: 'All-rounder', teamId: team5.id, stats: { matches: 107, runs: 2200, wickets: 89, strikeRate: 177.0 } },
  ];

  for (const p of playersData) {
    const existing = await prisma.player.findFirst({ where: { name: p.name, teamId: p.teamId } });
    // `sport` defaults to 'cricket'; set explicitly so adding other sports later is obvious.
    if (!existing) await prisma.player.create({ data: { ...p, sport: p.sport || 'cricket' } });
  }

  // ── Matches ─────────────────────────────────────────────────────
  const matchesData = [
    { team1Id: team1.id, team2Id: team2.id, status: 'completed', venue: 'Wankhede Stadium, Mumbai', matchType: 'T20', score1: '185/4 (20)', score2: '178/8 (20)' },
    { team1Id: team3.id, team2Id: team4.id, status: 'live', venue: 'M. Chinnaswamy Stadium, Bangalore', matchType: 'T20', score1: '156/3 (16.2)', score2: null },
    { team1Id: team5.id, team2Id: team1.id, status: 'scheduled', venue: 'Eden Gardens, Kolkata', matchType: 'T20', startTime: new Date(Date.now() + 86400000) },
    { team1Id: team2.id, team2Id: team3.id, status: 'completed', venue: 'MA Chidambaram Stadium, Chennai', matchType: 'ODI', score1: '298/6 (50)', score2: '301/4 (48.3)' },
    { team1Id: team4.id, team2Id: team5.id, status: 'scheduled', venue: 'Arun Jaitley Stadium, Delhi', matchType: 'T20', startTime: new Date(Date.now() + 172800000) },
  ];
  for (const m of matchesData) {
    await prisma.match.create({ data: m });
  }

  // ── News ────────────────────────────────────────────────────────
  const newsData = [
    { title: 'India wins thriller against Australia', summary: 'Last-over finish sees India clinch the series', body: 'In a nail-biting encounter at the MCG, India managed to chase down 298 in the final over, with Virat Kohli scoring a brilliant century to seal the series.', author: 'Cricket Times', category: 'International' },
    { title: 'IPL 2026 Auction: Record-breaking bids', summary: 'Players fetch historic prices at the mega auction', body: 'The IPL 2026 mega auction saw record-breaking bids as franchises scrambled to build their squads. Several uncapped players attracted crore-plus bids.', author: 'Sports Today', category: 'IPL' },
    { title: 'Bumrah returns to training after injury', summary: 'India pacer expected to be fit for World Cup', body: 'Jasprit Bumrah has started his rehabilitation and is expected to be match-fit within 6 weeks, ahead of the upcoming World Cup campaign.', author: 'Cricket Now', category: 'Players' },
    { title: 'New T20 rules announced by ICC', summary: 'Impact player and power surge rules modified', body: 'The ICC has announced several rule changes for T20 internationals starting from 2026, including modifications to the impact player clause.', author: 'ICC Media', category: 'Rules' },
    { title: 'Women\'s Premier League breaks viewership records', summary: 'WPL Season 3 viewership up 45% year-over-year', body: 'The Women\'s Premier League has seen massive growth in its third season, with total viewership crossing 500 million, a 45% increase from last year.', author: 'WPL Official', category: 'Women\'s Cricket' },
  ];
  for (const n of newsData) {
    await prisma.news.create({ data: n });
  }

  // ── Badges ──────────────────────────────────────────────────────
  const badgesData = [
    { title: 'First Century', description: 'Score your first 100 runs in a match', icon: '💯', points: 100 },
    { title: 'Hat-trick Hero', description: 'Take 3 wickets in 3 consecutive balls', icon: '🎩', points: 200 },
    { title: 'Match Winner', description: 'Win a match as captain', icon: '🏆', points: 150 },
    { title: 'Boundary King', description: 'Hit 10 fours in a single innings', icon: '🏏', points: 80 },
    { title: 'Economy Master', description: 'Bowl 4 overs with economy under 6', icon: '🎯', points: 120 },
    { title: 'Sharp Fielder', description: 'Take 3 catches in a match', icon: '🤲', points: 90 },
  ];
  for (const b of badgesData) {
    const existing = await prisma.badge.findFirst({ where: { title: b.title } });
    if (!existing) await prisma.badge.create({ data: b });
  }

  // ── Tournaments ─────────────────────────────────────────────────
  const tournamentsData = [
    { name: 'AllIn1 Premier League 2026', format: 'T20', status: 'ongoing', venue: 'Multiple Venues', startDate: new Date('2026-03-01'), endDate: new Date('2026-05-30') },
    { name: 'Corporate Cricket Challenge', format: 'T20', status: 'upcoming', venue: 'DY Patil Stadium, Mumbai', startDate: new Date('2026-04-15'), endDate: new Date('2026-04-20') },
    { name: 'Inter-College ODI Cup', format: 'ODI', status: 'upcoming', venue: 'Nehru Stadium, Delhi', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-10') },
    { name: 'Weekend Warriors League', format: 'T20', status: 'completed', venue: 'Local Grounds, Bangalore', startDate: new Date('2026-01-10'), endDate: new Date('2026-02-28') },
  ];
  for (const t of tournamentsData) {
    await prisma.tournament.create({ data: t });
  }

  // ── Streams ─────────────────────────────────────────────────────
  const streamsData = [
    { title: 'Mumbai vs Chennai - Live', channel: 'own', quality: 'HD', status: 'live', description: 'Watch the clash of titans live!' },
    { title: 'RCB vs DC - Highlights', channel: 'youtube', quality: '4K', status: 'completed', description: 'Full match highlights' },
    { title: 'KKR vs MI - Upcoming', channel: 'own', quality: 'HD', status: 'upcoming', description: 'Catch the game tomorrow at 7:30 PM' },
  ];
  for (const s of streamsData) {
    await prisma.stream.create({ data: s });
  }

  // ── Grounds ─────────────────────────────────────────────────────
  const groundsData = [
    { name: 'Mumbai Cricket Ground', location: 'Andheri, Mumbai', price: 2000, facilities: ['Floodlights', 'Pavilion', 'Parking', 'Washroom'] },
    { name: 'Delhi Sports Complex', location: 'CP, Delhi', price: 1500, facilities: ['Dressing Room', 'Scoreboard', 'Parking'] },
    { name: 'Bangalore Cricket Academy', location: 'Indiranagar, Bangalore', price: 2500, facilities: ['Floodlights', 'Net Practice', 'Coaching', 'Canteen'] },
    { name: 'Chennai Cricket Hub', location: 'T. Nagar, Chennai', price: 1800, facilities: ['Turf Wicket', 'Pavilion', 'Washroom'] },
    { name: 'Kolkata Green Park', location: 'Salt Lake, Kolkata', price: 1200, facilities: ['Parking', 'Scoreboard', 'Floodlights'] },
  ];
  for (const g of groundsData) {
    await prisma.ground.create({ data: g });
  }

  // ── Quizzes ─────────────────────────────────────────────────────
  await prisma.quiz.create({
    data: {
      title: 'Daily Cricket Quiz',
      description: 'Test your cricket knowledge with today\'s quiz!',
      difficulty: 'Medium',
      duration: 300,
      active: true,
      questions: [
        { question: 'Who holds the record for the highest individual score in ODI cricket?', options: ['Rohit Sharma', 'Virender Sehwag', 'Chris Gayle', 'Martin Guptill'], correct: 0 },
        { question: 'Which team won the 2019 ICC Cricket World Cup?', options: ['Australia', 'England', 'India', 'New Zealand'], correct: 1 },
        { question: 'Who has the most wickets in Test cricket?', options: ['Shane Warne', 'Anil Kumble', 'Muttiah Muralitharan', 'James Anderson'], correct: 2 },
        { question: 'What is the maximum number of overs in a T20 match per side?', options: ['15', '20', '25', '10'], correct: 1 },
        { question: 'Who captained India to their first T20 World Cup win in 2007?', options: ['Sourav Ganguly', 'Rahul Dravid', 'MS Dhoni', 'Sachin Tendulkar'], correct: 2 },
      ],
    },
  });

  console.log('✅ Seed completed — all tables populated with real data');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
