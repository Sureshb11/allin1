// seedContent.js — platform content ONLY (no fake users/teams/matches/posts).
// Populates the curated-content screens that ship empty otherwise: News,
// Badges catalogue, Grounds, Daily Quizzes, Coaches and Umpires directories.
// Idempotent: each section is skipped if its table already has rows.
//
//   node prisma/seedContent.js        (DATABASE_URL from .env — Neon in prod)

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const section = async (name, model, rows) => {
  const count = await model.count();
  if (count > 0) return console.log(`• ${name}: already has ${count} rows — skipped`);
  for (const r of rows) await model.create({ data: r });
  console.log(`✓ ${name}: seeded ${rows.length}`);
};

async function main() {
  await section('News', prisma.news, [
    { title: 'India seal last-over thriller against Australia', summary: 'Kohli century powers a 298 chase at the MCG', body: 'In a nail-biting encounter at the MCG, India chased down 298 in the final over, anchored by a brilliant Virat Kohli century. The series now moves to Sydney with India 2–1 up.', author: 'Cricket Times', category: 'International' },
    { title: 'IPL 2026 auction smashes records', summary: 'Uncapped Indian talent drives historic bidding war', body: 'The IPL 2026 mega auction saw record bids as franchises rebuilt their squads. Several uncapped domestic players crossed the crore mark, signalling the depth of India\'s grassroots pipeline.', author: 'Sports Today', category: 'IPL' },
    { title: 'Bumrah begins bowling in the nets again', summary: 'Pacer targets World Cup return after back rehab', body: 'Jasprit Bumrah has resumed bowling at the NCA and is expected to be match-fit within six weeks — a huge boost for India\'s World Cup plans.', author: 'Cricket Now', category: 'Players' },
    { title: 'ICC tweaks T20I playing conditions for 2026', summary: 'Impact-player and power-surge rules modified', body: 'The ICC announced updated T20I playing conditions effective 2026, refining the impact-player clause and introducing an optional two-over power surge between overs 11 and 16.', author: 'ICC Media', category: 'Rules' },
    { title: 'WPL Season 3 viewership up 45%', summary: 'Women\'s Premier League crosses 500M total views', body: 'The Women\'s Premier League continued its explosive growth in season three, with total viewership crossing 500 million — up 45% year on year.', author: 'WPL Official', category: 'Women\'s Cricket' },
    { title: 'Street cricket leagues boom across Tamil Nadu', summary: 'Tennis-ball tournaments now drawing 4-figure prize pools', body: 'Local tennis-ball cricket is having a moment: weekend tournaments across Chennai, Coimbatore and Madurai are drawing hundreds of teams, with organisers crediting scoring apps for the surge in competitive play.', author: 'Local Legends Desk', category: 'Grassroots' },
    { title: 'How to read a wagon wheel like a pro', summary: 'Turn your scoring data into better shot selection', body: 'Your wagon wheel tells a story: heavy square-of-the-wicket scoring often means you\'re playing late — which is fine on slow pitches but costly on true ones. Here\'s how to use your Local Legends match data to train smarter.', author: 'Coaching Corner', category: 'Tips' },
    { title: 'Five drills to add 10kph to your bowling', summary: 'Simple run-up and load-up fixes from district coaches', body: 'From braced front legs to hip-shoulder separation, these five drills used by district-level coaches consistently add pace without injury risk. All you need is a wall, a ball and 20 minutes.', author: 'Coaching Corner', category: 'Tips' },
  ]);

  await section('Badges', prisma.badge, [
    { title: 'First Century',   description: 'Score your first 100 in a match',            icon: '💯', points: 100 },
    { title: 'Hat-trick Hero',  description: 'Take 3 wickets in 3 consecutive balls',      icon: '🎩', points: 200 },
    { title: 'Match Winner',    description: 'Win a match as captain',                     icon: '🏆', points: 150 },
    { title: 'Boundary King',   description: 'Hit 10 fours in a single innings',           icon: '🏏', points: 80 },
    { title: 'Economy Master',  description: 'Bowl 4 overs with economy under 6',          icon: '🎯', points: 120 },
    { title: 'Sharp Fielder',   description: 'Take 3 catches in a match',                  icon: '🤲', points: 90 },
    { title: 'Fifty Club',      description: 'Score five half-centuries',                  icon: '🖐️', points: 110 },
    { title: 'Iron Wall',       description: 'Keep wicket through a full match, no byes',  icon: '🧤', points: 100 },
  ]);

  await section('Grounds', prisma.ground, [
    { name: 'Marina Turf Arena',        location: 'Besant Nagar, Chennai',  price: 1800, facilities: ['Turf Wicket', 'Floodlights', 'Pavilion', 'Washroom'] },
    { name: 'Chepauk Practice Nets',    location: 'Triplicane, Chennai',    price: 900,  facilities: ['Net Practice', 'Coaching', 'Washroom'] },
    { name: 'OMR Sports Village',       location: 'Sholinganallur, Chennai',price: 2200, facilities: ['Floodlights', 'Parking', 'Canteen', 'Scoreboard'] },
    { name: 'Andheri Cricket Ground',   location: 'Andheri West, Mumbai',   price: 2000, facilities: ['Floodlights', 'Pavilion', 'Parking', 'Washroom'] },
    { name: 'Powai Green Oval',         location: 'Powai, Mumbai',          price: 2400, facilities: ['Turf Wicket', 'Dressing Room', 'Parking'] },
    { name: 'Indiranagar Academy Oval', location: 'Indiranagar, Bangalore', price: 2500, facilities: ['Floodlights', 'Net Practice', 'Coaching', 'Canteen'] },
    { name: 'Salt Lake Green Park',     location: 'Salt Lake, Kolkata',     price: 1200, facilities: ['Parking', 'Scoreboard', 'Floodlights'] },
    { name: 'Gachibowli Sports Hub',    location: 'Gachibowli, Hyderabad',  price: 1600, facilities: ['Turf Wicket', 'Floodlights', 'Washroom', 'Parking'] },
  ]);

  await section('Quizzes', prisma.quiz, [
    { title: 'Daily Cricket Quiz', description: 'Test your cricket knowledge!', difficulty: 'Medium', duration: 300, active: true, questions: [
      { question: 'Who holds the record for the highest individual ODI score?', options: ['Rohit Sharma', 'Virender Sehwag', 'Chris Gayle', 'Martin Guptill'], correct: 0 },
      { question: 'Which team won the 2019 ICC Cricket World Cup?', options: ['Australia', 'England', 'India', 'New Zealand'], correct: 1 },
      { question: 'Who has the most wickets in Test cricket?', options: ['Shane Warne', 'Anil Kumble', 'Muttiah Muralitharan', 'James Anderson'], correct: 2 },
      { question: 'Maximum overs per side in a T20 match?', options: ['15', '20', '25', '10'], correct: 1 },
      { question: 'Who captained India to the 2007 T20 World Cup title?', options: ['Sourav Ganguly', 'Rahul Dravid', 'MS Dhoni', 'Sachin Tendulkar'], correct: 2 },
    ]},
    { title: 'Rules & Umpiring Quiz', description: 'How well do you know the laws of cricket?', difficulty: 'Hard', duration: 300, active: true, questions: [
      { question: 'How many ways can a batter be dismissed in cricket?', options: ['8', '9', '10', '11'], correct: 2 },
      { question: 'A ball bounces twice before reaching the batter. The umpire calls…', options: ['Dead ball', 'No-ball', 'Wide', 'Legal delivery'], correct: 1 },
      { question: 'Minimum fielders (incl. keeper) inside the 30-yard circle in ODI middle overs?', options: ['2', '3', '4', '5'], correct: 2 },
      { question: 'If the ball hits a helmet lying on the field, the batting side gets…', options: ['4 runs', '5 penalty runs', '6 runs', 'Nothing'], correct: 1 },
      { question: 'A batter can be stumped off a…', options: ['No-ball', 'Wide', 'Free hit', 'Overthrow'], correct: 1 },
    ]},
    { title: 'Local Legends Starter Quiz', description: 'Easy warm-up — five quick ones', difficulty: 'Easy', duration: 180, active: true, questions: [
      { question: 'How many players are in a cricket team\'s playing XI?', options: ['10', '11', '12', '9'], correct: 1 },
      { question: 'How many balls make one over?', options: ['4', '5', '6', '8'], correct: 2 },
      { question: 'What does LBW stand for?', options: ['Leg Before Wicket', 'Long Ball Wide', 'Left Bat Wide', 'Leg Bye Wicket'], correct: 0 },
      { question: 'Which shot goes behind the keeper off a short ball?', options: ['Cover drive', 'Upper cut', 'Sweep', 'On drive'], correct: 1 },
      { question: 'Hitting the ball over the boundary on the full scores…', options: ['4', '5', '6', '7'], correct: 2 },
    ]},
  ]);

  await section('Coaches', prisma.coach, [
    { name: 'R. Srinivasan',   speciality: 'Batting',   experience: 12, location: 'Chennai',   bio: 'Former TNCA first-division opener. Specialises in technique rebuilds and top-order batting.', rating: 4.8, pricePerHour: 800 },
    { name: 'Ajit Deshmukh',   speciality: 'Bowling',   experience: 15, location: 'Mumbai',    bio: 'Ex-Ranji seamer. Pace development, run-up mechanics and death-overs planning.', rating: 4.7, pricePerHour: 1000 },
    { name: 'Kavya Nair',      speciality: 'All-round', experience: 8,  location: 'Bangalore', bio: 'Karnataka women\'s team all-rounder. Junior development and match-scenario training.', rating: 4.9, pricePerHour: 900 },
    { name: 'Imran Shaikh',    speciality: 'Fielding',  experience: 10, location: 'Hyderabad', bio: 'Fielding specialist — ground coverage, catching drills and throwing mechanics.', rating: 4.6, pricePerHour: 700 },
    { name: 'Suresh Menon',    speciality: 'Bowling',   experience: 20, location: 'Chennai',   bio: 'Spin-bowling guru. Off-spin, leg-spin and the modern mystery repertoire.', rating: 4.8, pricePerHour: 1200 },
    { name: 'Priya Raghavan',  speciality: 'Batting',   experience: 6,  location: 'Coimbatore',bio: 'Power-hitting and strike-rotation coach for T20 formats.', rating: 4.5, pricePerHour: 600 },
  ]);

  await section('Umpires', prisma.umpire, [
    { name: 'K. Raman',        level: 'state',    experience: 14, location: 'Chennai',   bio: 'TNCA panel umpire; 200+ league matches.', contactInfo: 'via app' },
    { name: 'Vikram Joshi',    level: 'district', experience: 9,  location: 'Mumbai',    bio: 'MCA district panel; T20 specialist.', contactInfo: 'via app' },
    { name: 'Abdul Kareem',    level: 'state',    experience: 18, location: 'Hyderabad', bio: 'HCA senior panel; also mentors new umpires.', contactInfo: 'via app' },
    { name: 'Sanjay Kulkarni', level: 'local',    experience: 5,  location: 'Pune',      bio: 'Weekend league regular; tennis-ball and leather.', contactInfo: 'via app' },
    { name: 'Meena Krishnan',  level: 'district', experience: 7,  location: 'Bangalore', bio: 'KSCA district panel; women\'s league lead umpire.', contactInfo: 'via app' },
    { name: 'Joseph Fernandes',level: 'local',    experience: 4,  location: 'Goa',       bio: 'Beach and turf formats; flexible weekend availability.', contactInfo: 'via app' },
  ]);

  console.log('\n✅ Content seed complete');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
