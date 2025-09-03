export default async function logoutHandler(req, res) {
  try {
    // Expire common cookie names. HttpOnly cookies must be cleared by the server.
    const expires = new Date(0).toUTCString();
    const cookiesToClear = ['token', 'session', 'connect.sid'];
    const setCookies = cookiesToClear.map(name => `${name}=; Path=/; Expires=${expires}; HttpOnly; SameSite=Lax`);
    // Set multiple Set-Cookie headers
    res.setHeader('Set-Cookie', setCookies);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('logoutHandler error', err);
    res.status(500).json({ ok: false, error: 'logout failed' });
  }
}
