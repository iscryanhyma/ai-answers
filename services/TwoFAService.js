import dotenv from 'dotenv';
import GCNotifyService from './GCNotifyService.js';
import { User } from '../models/user.js';
import ServerLoggingService from './ServerLoggingService.js';
import { authenticator } from 'otplib';
import crypto from 'crypto';

dotenv.config();

// When using TOTP we do not store transient codes. We store a per-user secret.

function generateSecret() {
  return authenticator.generateSecret();
}

async function send2FACode({ userOrId, templateId = process.env.GC_NOTIFY_2FA_TEMPLATE_ID } = {}) {
  let user = null;
  if (typeof userOrId === 'string' || userOrId instanceof String) {
    user = await User.findById(userOrId);
  } else if (userOrId && userOrId._id) {
    user = userOrId;
  }

  if (!user) {
    throw new Error('User not found');
  }

  if (!user.email) {
    throw new Error('User has no email');
  }

  if (!templateId) {
    ServerLoggingService.error('GC 2FA template id missing', 'twofa-service');
    throw new Error('GC_NOTIFY_2FA_TEMPLATE_ID missing');
  }

  // Ensure user has a twoFASecret
  if (!user.twoFASecret) {
    user.twoFASecret = generateSecret();
    await user.save();
  }

  const code = authenticator.generate(user.twoFASecret);

  // Personalisation expected by the 2FA template:
  // Hi ((name)),
  //
  // Here is your verification code to log in to -application name-:
  //
  // ((verify_code)), please update
  const personalisation = {
    name: user.name || '',
    verify_code: code,
  };

  // Send email via GCNotifyService with explicit templateId
  const res = await GCNotifyService.sendEmail({
    email: user.email,
    personalisation,
    templateId,
  });

  return { success: res.success, codeSent: code, notifyResponse: res };
}

async function verify2FACode({ userOrId, code } = {}) {
  let user = null;
  if (typeof userOrId === 'string' || userOrId instanceof String) {
    user = await User.findById(userOrId);
  } else if (userOrId && userOrId._id) {
    user = userOrId;
  }

  if (!user) return { success: false, reason: 'not_found' };

  if (!user.twoFASecret) return { success: false, reason: 'no_secret' };

  const isValid = authenticator.check(String(code), user.twoFASecret);
  if (!isValid) return { success: false, reason: 'mismatch' };

  return { success: true };
}

const TwoFAService = {
  send2FACode,
  verify2FACode,
};

export default TwoFAService;
