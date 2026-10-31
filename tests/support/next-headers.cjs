// Test stand-in for `next/headers` so route handlers can run outside the Next.js server.
// Tests set globalThis.__testCookies = { pesu_session: '<jwt>' } to act as a user.
exports.cookies = async () => ({
  get: (name) => {
    const value = globalThis.__testCookies?.[name];
    return value === undefined ? undefined : { name, value };
  },
});
exports.headers = async () => new Headers();
