import { prisma } from './prisma.js';

// A user is a "team admin" — allowed to manage the team (logo, cover, members,
// awards, gallery, promoting others) — if they are the team owner, or a member
// (Player linked to their user id) whose isAdmin flag is set. Legacy teams with
// no recorded owner are editable by any signed-in user (and get claimed on the
// first edit), preserving the pre-ownership behaviour.
export async function isTeamAdmin(teamId, uid) {
  if (!teamId || !uid) return false;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { ownerId: true } });
  if (!team) return false;
  if (!team.ownerId) return true;               // unowned legacy team
  if (team.ownerId === uid) return true;         // the owner
  const admin = await prisma.player.findFirst({ where: { teamId, userId: uid, isAdmin: true } });
  return !!admin;
}
