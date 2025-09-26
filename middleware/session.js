import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import SessionManagementService from '../services/SessionManagementService.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';
const fingerprintPepper = process.env.FP_PEPPER || 'dev-pepper';
const CHAT_COOKIE_NAME = 'token';
const SESSION_COOKIE_NAME = 'sessionToken';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Express/Next.js style middleware
export default function sessionMiddleware(options = {}) {
  return async function (req, res, next) {
    try {
      const cookies = parseCookies(req.headers?.cookie || '');

      // Preserve existing chat token behaviour for compatibility
      let chatId = null;
      const chatToken = cookies[CHAT_COOKIE_NAME];
      if (chatToken) {
        try {
          const decodedChat = jwt.decode(chatToken) || {};
          chatId = decodedChat.jti || decodedChat.jwtid || null;
        } catch (e) {
          // ignore malformed chat token
        }
      }

      if (!chatId) {
        chatId = req.query?.chatId || req.headers['x-chat-id'] || null;
      }
      if (chatId) req.chatId = chatId;

      let sessionId = null;
      const sessionToken = cookies[SESSION_COOKIE_NAME] || req.headers['x-session-token'];
      if (sessionToken) {
        try {
          const decodedSession = jwt.verify(sessionToken, secretKey) || {};
          sessionId = decodedSession.jti || decodedSession.jwtid || null;
        } catch (err) {
          sessionId = null;
        }
      }

      let sessionInfo = sessionId ? SessionManagementService.getInfo(sessionId) : null;

      if (sessionId && !sessionInfo) {
        if (!SessionManagementService.hasCapacity()) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
        }

        const reg = await SessionManagementService.register(sessionId);
        if (!reg.ok) {
          if (reg.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
        sessionInfo = reg.session || SessionManagementService.getInfo(sessionId);
      }

      if (!sessionId) {
        if (!SessionManagementService.hasCapacity()) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
        }

        const fingerprintHeader = (req.headers['x-fp-hash'] || req.headers['x-fp-id'] || '').toString();
        const fingerprintKey = fingerprintHeader
          ? crypto.createHmac('sha256', fingerprintPepper).update(fingerprintHeader).digest('hex')
          : null;
        const ip = extractClientIp(req);
        const canCreate = SessionManagementService.canCreateSession({ fingerprintKey, ip });
        if (!canCreate.ok) {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: canCreate.reason || 'sessionCreateThrottled' }));
        }

        sessionId = uuidv4();
        const reg = await SessionManagementService.register(sessionId);
        if (!reg.ok) {
          if (reg.reason === 'capacity') {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'noSessionCapacity' }));
          }
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'couldNotRegister' }));
        }
        sessionInfo = reg.session || SessionManagementService.getInfo(sessionId);

        const sessionJwt = jwt.sign({}, secretKey, { jwtid: sessionId, expiresIn: `${SESSION_TTL_SECONDS}s` });
        appendSetCookie(res, `${SESSION_COOKIE_NAME}=${sessionJwt}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`);
      } else if (sessionId) {
        SessionManagementService.touch(sessionId);
      }

      if (!sessionId) {
        return next();
      }

      const allowed = SessionManagementService.canConsume(sessionId, 1);
      if (!allowed.ok) {
        if (allowed.reason === 'noCredits') {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'noCredits' }));
        }
        res.statusCode = 429;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: 'rateLimitExceeded' }));
      }

  req.sessionId = sessionId;
  req.session = sessionInfo || SessionManagementService.getInfo(sessionId);
  req.chatSession = req.session;
      return next();
    } catch (err) {
      if (console && console.error) console.error('sessionMiddleware error', err);
      return next();
    }
  };
}

function parseCookies(header) {
  return header
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) return acc;
      const key = pair.slice(0, eqIndex);
      const value = pair.slice(eqIndex + 1);
      acc[key] = value;
      return acc;
    }, {});
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookie]);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader('Set-Cookie', [...current, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [current, cookie]);
}

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || null;
}
