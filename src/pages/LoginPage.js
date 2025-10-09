import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.js';
import AuthService from '../services/AuthService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import styles from '../styles/auth.module.css';

const LoginPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const navigate = useNavigate();
  const { login, refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const data = await login(email, password);
      // If backend requires 2FA, backend already sent the email; prompt for code
      if (data && data.twoFA) {
        setShow2FA(true);
        return;
      }
      const defaultRoute = data?.defaultRoute || '/';
      navigate(defaultRoute);
    } catch (err) {
      setError(t('login.invalidCredentials'));
    } finally {
      setIsLoading(false);
    }
  };

  // 2FA state
  const [show2FA, setShow2FA] = useState(false);
  const [code, setCode] = useState('');
  const [twoFAError, setTwoFAError] = useState('');

  const verify2FA = async () => {
    setIsLoading(true);
    setTwoFAError('');
    try {
      const data = await AuthService.verify2FA(email, code);
      // AuthService stores token and user; refresh context
      await Promise.resolve(refreshUser());
      const defaultRoute = data?.defaultRoute || '/';
      navigate(defaultRoute);
    } catch (err) {
      setTwoFAError(t('login.2fa.invalidCode') || 'Invalid verification code');
    } finally {
      setIsLoading(false);
    }
  };

  // Request a 2FA code to be sent to the user's email (public endpoint)
  const request2FA = async () => {
    if (!email) return;
    setIsLoading(true);
    setError('');
    try {
      await AuthService.send2FA(email);
      setShow2FA(true);
    } catch (err) {
      setError(t('login.2fa.sendError') || 'Failed to send 2FA code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.login_container}>
      <h1>{t('login.title')}</h1>
      {error && <div className={styles.error_message}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className={styles.form_group}>
          <label htmlFor="email">{t('login.email')}</label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div className={styles.form_group}>
          <label htmlFor="password">{t('login.password')}</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <button type="submit" disabled={isLoading} className={styles.submit_button}>
          {isLoading ? t('login.form.submitting') : t('login.submit')}
        </button>
      </form>
      {show2FA && (
        <div className={styles.twofa_container}>
          <h2>{t('login.2fa.title') || 'Two-factor verification'}</h2>
          {twoFAError && <div className={styles.error_message}>{twoFAError}</div>}
          <div className={styles.form_group}>
            <label htmlFor="code">{t('login.2fa.code') || 'Verification code'}</label>
            <input id="code" value={code} onChange={(e) => setCode(e.target.value)} disabled={isLoading} />
          </div>
          <div className={styles.twofa_actions}>
            <button onClick={verify2FA} disabled={isLoading} className={styles.submit_button}>
              {t('login.2fa.verify') || 'Verify code'}
            </button>
            <button onClick={request2FA} disabled={isLoading || !email} className={styles.secondary_button}>
              {t('login.2fa.resend') || 'Resend code'}
            </button>
          </div>
        </div>
      )}
      <div className={styles['auth-links']}>
        <Link to={`/${lang}/signup`}>{t('login.form.signupLink')}</Link>
      </div>
    </div>
  );
};

export default LoginPage;