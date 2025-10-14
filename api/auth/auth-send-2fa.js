import dbConnect from '../db/db-connect.js';
import { User } from '../../models/user.js';
import TwoFAService from '../../services/TwoFAService.js';

const send2FAHandler = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: 'email required' });

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'user not found' });

    const result = await TwoFAService.send2FACode({ userOrId: user });
    return res.status(200).json({ success: true, notify: result.notifyResponse });
  } catch (err) {
    console.error('user-send-2fa handler error', err);
    return res.status(500).json({ success: false, error: 'failed to send 2fa' });
  }
};

export default send2FAHandler;
