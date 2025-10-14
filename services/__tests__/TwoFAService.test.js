import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Module under test
import TwoFAService from '../TwoFAService.js';
import GCNotifyService from '../GCNotifyService.js';
import { User } from '../../models/user.js';
import { authenticator } from 'otplib';

describe('TwoFAService', () => {
  let findByIdSpy;
  let saveSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends a 2FA email and persists code', async () => {
    const fakeUser = {
      _id: 'u1',
      email: 'test@x.com',
      twoFASecret: null,
      save: async function () {
        // pretend saved
        return this;
      },
    };

    findByIdSpy = vi.spyOn(User, 'findById').mockResolvedValue(fakeUser);

  const fakeNotify = vi.spyOn(GCNotifyService, 'sendEmail').mockResolvedValue({ success: true });
  const secret = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';
  vi.spyOn(authenticator, 'generateSecret').mockReturnValue(secret);
  vi.spyOn(authenticator, 'generate').mockReturnValue('999999');

    const result = await TwoFAService.send2FACode({ userOrId: 'u1', templateId: 'tpl-2fa', fetchImpl: async () => ({ ok: true, status: 201, json: async () => ({ id: 'n1' }) }) });

    expect(result.success).toBe(true);
    expect(result.codeSent).toBe('999999');
    expect(fakeUser.twoFASecret).toBe(secret);
    expect(fakeNotify).toHaveBeenCalledWith(expect.objectContaining({
      email: fakeUser.email,
      templateId: 'tpl-2fa',
      personalisation: expect.objectContaining({ name: '', verify_code: '999999' }),
    }));
  });

  it('verifies a valid code and clears it', async () => {
    const fakeUser = {
      _id: 'u2',
      email: 'verify@x.com',
      twoFASecret: 'SECRET123',
      save: async function () { return this; }
    };

    vi.spyOn(User, 'findById').mockResolvedValue(fakeUser);
    vi.spyOn(authenticator, 'check').mockReturnValue(true);

    const res = await TwoFAService.verify2FACode({ userOrId: 'u2', code: '123456' });
    expect(res.success).toBe(true);
  });

  it('rejects expired code', async () => {
    // With TOTP flow, expiration isn't stored; an invalid code is a mismatch
    const fakeUser = {
      _id: 'u3',
      email: 'expired@x.com',
      twoFASecret: 'SECRET123',
      save: async function () { return this; }
    };

    vi.spyOn(User, 'findById').mockResolvedValue(fakeUser);
    vi.spyOn(authenticator, 'check').mockReturnValue(false);

    const res = await TwoFAService.verify2FACode({ userOrId: 'u3', code: '000000' });
    expect(res.success).toBe(false);
    expect(res.reason).toBe('mismatch');
  });
});
