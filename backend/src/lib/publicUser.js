// The shape of a User that is safe to send to a client.
//
// Signup, login and GET /users/me each responded with a bare Prisma User row,
// which carries `passwordHash`. So the bcrypt hash was handed back on every
// login and every profile fetch — to the account's own owner, but still into
// app memory, crash reporters, proxy logs and anything else that sees a
// response body. The OTP verify route already hand-picked its fields; this is
// that same discipline, in one place, so the next route can't get it wrong.
//
//   res.json({ token, user: publicUser(user) })
const SENSITIVE = ['passwordHash'];

export const publicUser = (user) => {
  if (!user || typeof user !== 'object') return user;
  const out = {};
  for (const [k, v] of Object.entries(user)) {
    if (!SENSITIVE.includes(k)) out[k] = v;
  }
  return out;
};

export default publicUser;
