import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import SessionManagementService from '../../services/SessionManagementService.js';

const secretKey = process.env.JWT_SECRET_KEY || 'dev-secret';

export default async function handler(req, res) {
  const readableId = uuidv4();

  // Check capacity before issuing
  if (!SessionManagementService.hasCapacity()) {
    return res.status(503).json({ error: 'capacity' });
  }

  // Register session with default rate limit
  const reg = SessionManagementService.register(readableId, { rateLimit: { capacity: 60, refillPerSec: 1 } });
  if (!reg.ok) {
    return res.status(503).json({ error: 'could_not_register' });
  }

  // Create JWT with jwtid set to readableId
  const options = { jwtid: readableId, expiresIn: '1h' };
  const token = jwt.sign({}, secretKey, options);

  res.setHeader('Set-Cookie', [
    `token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600`
  ]);

  return res.status(200).json({ chatId: readableId });
}
