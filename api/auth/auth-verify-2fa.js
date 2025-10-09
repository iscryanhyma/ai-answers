import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import TwoFAService from '../../services/TwoFAService.js';

const verify2FAHandler = async (req, res) => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ success: false, message: 'email and code required' });

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'user not found' });

    const result = await TwoFAService.verify2FACode({ userOrId: user, code });
    if (result.success) return res.status(200).json({ success: true });
    return res.status(401).json({ success: false, reason: result.reason || 'invalid' });
  } catch (err) {
    console.error('user-verify-2fa handler error', err);
    return res.status(500).json({ success: false, error: 'failed to verify 2fa' });
  }
};

export default verify2FAHandler;
