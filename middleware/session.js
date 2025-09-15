import jwt from 'jsonwebtoken';
import SessionManagementService from '../services/SessionManagementService.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  const rateLimit = options.rateLimit || {capacity: 60, refillPerSec: 1};

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
          return res.end('Server capacity exceeded, try again later');
        }

        const r = SessionManagementService.register(chatId, {rateLimit});
        if (!r.ok) {
          res.statusCode = 503;
          return res.end('Could not register session');
        }
      } else {
        SessionManagementService.touch(chatId);
      }

      // Rate limit check
      const allowed = SessionManagementService.canConsume(chatId, 1);
      if (!allowed.ok) {
        res.statusCode = 429;
        return res.end('Rate limit exceeded');
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
