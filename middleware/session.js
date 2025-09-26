import jwt from 'jsonwebtoken';
import SessionManagementService from '../services/SessionManagementService.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  // Rate limit configuration should come from SessionManagementService (which reads persisted
  // settings from SettingsService). Do not allow middleware to override capacity/refill.

  return async function (req, res, next) {
    try {
      // Try cookie first
      let chatId = null;
      const cookieHeader = req.headers?.cookie;
      if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|; )token=([^;]+)/);
        if (match) {
          const token = match[1];
          try {
            const decoded = jwt.decode(token) || {};
            // jwtid is available as 'jti' in jwt decode, or jwt.sign option jwtid
            chatId = decoded.jti || decoded.jwtid || null;
          } catch (e) {
            // ignore
          }
        }
      }

      // fallback to query param or header
      if (!chatId) chatId = req.query?.chatId || req.headers['x-chat-id'] || null;

      // If no chatId, proceed but do not register session
      if (!chatId) {
        return next();
      }

      // If session doesn't exist, attempt to register
      const existing = SessionManagementService.getInfo(chatId);
      if (!existing) {
        if (!SessionManagementService.hasCapacity()) {
          res.statusCode = 503;
          return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
        }

        // Register without passing a local rateLimit so the service applies its configured defaults.
        const r = await SessionManagementService.register(chatId);
        if (!r.ok) {
          // If register failed for capacity reasons, return specific error.
          if (r.reason === 'capacity') {
            res.statusCode = 503;
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          res.statusCode = 503;
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
      } else {
        SessionManagementService.touch(chatId);
      }

      // Rate limit check
      const allowed = SessionManagementService.canConsume(chatId, 1);
      if (!allowed.ok) {
        // Map service reasons to client-visible error codes
        if (allowed.reason === 'noCredits') {
          res.statusCode = 429;
          return res.end(JSON.stringify({ error: 'noCredits' }));
        }
        // fallback
        res.statusCode = 429;
        return res.end(JSON.stringify({ error: 'rateLimitExceeded' }));
      }

      // Attach session info
      req.chatSession = SessionManagementService.getInfo(chatId);
      return next();
    } catch (err) {
      // On error, allow request to proceed but log if available
      if (console && console.error) console.error('sessionMiddleware error', err);
      return next();
    }
  };
}
