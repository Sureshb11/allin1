import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  try {
    // 1. Create teams and players
    const team1 = await prisma.team.create({ data: { name: 'Test Team 1' } });
    const team2 = await prisma.team.create({ data: { name: 'Test Team 2' } });

    const batter = await prisma.player.create({ data: { name: 'Virat', role: 'Batsman', teamId: team1.id } });
    const nonStriker = await prisma.player.create({ data: { name: 'Rohit', role: 'Batsman', teamId: team1.id } });
    const bowler = await prisma.player.create({ data: { name: 'Starc', role: 'Bowler', teamId: team2.id } });

    // 2. Mock a Match request 
    const match = await prisma.match.create({
      data: {
        team1Id: team1.id,
        team2Id: team2.id,
        status: 'live',
        matchType: 'T20',
        currentInnings: 1
      }
    });

    // Auto-create initial Innings (same as matches.js post handler)
    const inning = await prisma.inning.create({
      data: {
        matchId: match.id,
        inningNumber: 1,
        battingTeamId: team1.id,
        bowlingTeamId: team2.id,
      }
    });

    // 3. Mock incoming PUT /score request payload
    const scoreData = {
      inningId: inning.id,
      overNumber: 1,
      ballNumber: 1,
      bowlerId: bowler.id,
      batterId: batter.id,
      nonStrikerId: nonStriker.id,
      runs: 4,
      extras: 0,
      isWicket: false
    };

    // Ensure over exists
    let over = await prisma.over.findUnique({
      where: {
        inningId_overNumber: { inningId: scoreData.inningId, overNumber: scoreData.overNumber }
      }
    });

    if (!over) {
      over = await prisma.over.create({
        data: {
          inningId: scoreData.inningId,
          overNumber: scoreData.overNumber,
          bowlerId: scoreData.bowlerId,
        }
      });
    }

    // Insert ball
    const ball = await prisma.ball.create({
      data: {
        overId: over.id,
        ballNumber: scoreData.ballNumber,
        batterId: scoreData.batterId,
        nonStrikerId: scoreData.nonStrikerId,
        runs: scoreData.runs,
        extras: scoreData.extras,
        extraType: scoreData.extraType,
        isWicket: scoreData.isWicket,
        wicketType: scoreData.wicketType,
        dismissedPlayerId: scoreData.dismissedPlayerId,
      }
    });

    await prisma.over.update({
      where: { id: over.id },
      data: {
        runs: { increment: scoreData.runs },
        extras: { increment: scoreData.extras },
        wickets: { increment: scoreData.isWicket ? 1 : 0 },
      }
    });

    await prisma.inning.update({
      where: { id: scoreData.inningId },
      data: {
        totalRuns: { increment: scoreData.runs + scoreData.extras },
        totalWickets: { increment: scoreData.isWicket ? 1 : 0 },
      }
    });

    // 4. Fetch Scorecard
    const detailedMatch = await prisma.match.findUnique({
      where: { id: match.id },
      include: {
        team1: true,
        team2: true,
        innings: {
          include: {
            battingTeam: true,
            bowlingTeam: true,
            oversData: {
              include: {
                bowler: true,
                balls: {
                  include: { batter: true, nonStriker: true },
                  orderBy: { ballNumber: 'asc' }
                }
              },
              orderBy: { overNumber: 'asc' }
            }
          },
          orderBy: { inningNumber: 'asc' }
        }
      }
    });

    console.log("SCORECARD SUCCESS! Match fetched with Innings -> Overs -> Balls");
    console.log("Total runs:", detailedMatch.innings[0].totalRuns);
    console.log("Runs off over 1, ball 1:", detailedMatch.innings[0].oversData[0].balls[0].runs);
    console.log("Batter:", detailedMatch.innings[0].oversData[0].balls[0].batter.name);
    
    // Cleanup
    await prisma.ball.deleteMany({ where: { overId: over.id }});
    await prisma.over.deleteMany({ where: { inningId: inning.id }});
    await prisma.inning.deleteMany({ where: { matchId: match.id }});
    await prisma.match.delete({ where: { id: match.id }});
    await prisma.player.deleteMany({ where: { id: { in: [batter.id, nonStriker.id, bowler.id] } } });
    await prisma.team.deleteMany({ where: { id: { in: [team1.id, team2.id] } } });

  } catch(e) {
    console.error("Test failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
