import re

with open('backend/src/lib/playerCareer.js', 'r') as f:
    content = f.read()

# We need to find the non-cricket block
block = """
  if (player.sport && player.sport !== 'cricket') {
    const evs = await prisma.sportEvent.findMany({
      where: { playerId: { in: ids } },
      select: { matchId: true, eventType: true, value: true },
    });
    const byType = {};
    for (const e of evs) byType[e.eventType] = (byType[e.eventType] || 0) + 1;
    const played = new Set(evs.map((e) => e.matchId)).size;

    let status = 'AVAILABLE';
    if (played === 0) status = 'NOT_AVAILABLE';
    else if (Object.keys(byType).length === 0) status = 'INSUFFICIENT_DATA';

    return {
      ...envelope,
      status,
      stats: {
        ...BASE,
        matches: played || seasonMatches,
        eventTotals: byType,               // { goal: 5, 'yellow-card': 2, … }
        seasonMatches,
        awards,
        momCount: awards.motm,             // kept for older clients
        recentForm,
      },
    };
  }
"""

# Replace the block
content = re.sub(
    r"if \(player\.sport && player\.sport !== 'cricket'\) \{.*?return \{\s*\.\.\.envelope,.*?\};\s*\}",
    block,
    content,
    flags=re.DOTALL
)

with open('backend/src/lib/playerCareer.js', 'w') as f:
    f.write(content)
