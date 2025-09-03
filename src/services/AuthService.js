import { getApiUrl } from '../utils/apiToUrl.js';

class AuthService {
  static unauthorizedCallback = null; // <-- Add this

    // Send user details (token) with every request, no logout or 401 handling
    static async fetchWithUser(url, options = {}) {
      const token = this.getToken();
      const headers = { ...options.headers };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const method = (options.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH'].includes(method) && options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      return fetch(url, { ...options, headers });
    }
  static setUnauthorizedCallback(cb) {
    this.unauthorizedCallback = cb;
  }

  static setToken(token) {
    localStorage.setItem('token', token);
  }

  static getToken() {
    return localStorage.getItem('token');
  }

  static setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  static getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  static removeToken() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    } catch (e) {
      // ignore storage errors
      console.warn('removeToken error', e);
    }
  }

  static logout() {
    // Remove known auth keys
    this.removeToken();

    // Attempt to notify server to clear HttpOnly cookies (fire-and-forget)
    try {
      // Use configured API URL helper so the endpoint resolution is consistent
      const logoutUrl = getApiUrl('user-auth-logout');
      // Fire-and-forget, don't await; ignore errors
      fetch(logoutUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
        .catch(() => {});
    } catch (e) {
      // ignore
    }

    // Clear all client-side storage and cookies (non-HttpOnly)
    this.clearClientStorage();
  }

  // Clear localStorage, sessionStorage and non-HttpOnly cookies.
  // Note: HttpOnly cookies cannot be cleared via JavaScript; they must be cleared by the server.
  static clearClientStorage() {
    try {
      if (typeof window === 'undefined') return;

      // Clear storages
      try {
        if (window.localStorage) window.localStorage.clear();
      } catch (e) {
        console.warn('localStorage.clear() failed', e);
      }
      try {
        if (window.sessionStorage) window.sessionStorage.clear();
      } catch (e) {
        console.warn('sessionStorage.clear() failed', e);
      }

      // Clear non-HttpOnly cookies by expiring them
      if (typeof document !== 'undefined' && document.cookie) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          // Set cookie with past expiry for all paths and current domain
          try {
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            // Also attempt to clear cookie for current domain/host variations
            try {
              const hostParts = window.location.hostname.split('.');
              // progressively try domain variations
              for (let i = 0; i <= hostParts.length - 1; i++) {
                const domain = hostParts.slice(i).join('.');
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + domain;
              }
            } catch (domErr) {
              // ignore domain clear errors
            }
          } catch (e) {
            // ignore per-cookie errors
          }
        }
      }
    } catch (e) {
      console.error('clearClientStorage error', e);
    }
  }

  static isAuthenticated() {
    const token = this.getToken();
    const user = this.getUser();
    
    if (!token || !user || !user.active) {
      return false;
    }
    
    if (this.isTokenExpired()) {
      this.logout();
      return false;
    }
    
    return true;
  }

  static isTokenExpired() {
    const token = this.getToken();
    if (!token) {
      return true;
    }
    
    try {
      // JWT tokens are in format: header.payload.signature
      // We need to decode the payload to check expiration
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      
      // Check if exp field exists and token is expired
      if (decoded.exp) {
        const currentTime = Date.now() / 1000;
        return decoded.exp < currentTime;
      }
      return false;
    } catch (error) {
      console.error('Error checking token expiration:', error);
      return true; // If there's an error parsing, assume token is invalid
    }
  }

  static isAdmin() {
    const user = this.getUser();
    return !!user && user.role === 'admin';
  }

  static async signup(email, password) {
    const response = await fetch(getApiUrl('db-auth-signup'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Signup failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  static async login(email, password) {
    const response = await fetch(getApiUrl('db-auth-login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  }

  static isPublicRoute(pathname) {
    // Define public routes that do not require authentication
    const publicRoutes = ['/', '/signin', '/signup', '/about', '/contact'];
    return publicRoutes.some(route => pathname.startsWith(route));
  }

  static getAuthHeader() {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  static async fetchWithAuth(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const hasBody = !!options.body;

    // Start with authentication header
    let combinedHeaders = { ...this.getAuthHeader() };

    // Add Content-Type: application/json by default for relevant methods with a body,
    // but only if not already specified in options.headers.
    if (['POST', 'PUT', 'PATCH'].includes(method) && hasBody) {
      if (!(options.headers && options.headers['Content-Type'])) {
        combinedHeaders['Content-Type'] = 'application/json';
      }
    }

    // Merge with any headers passed in options, allowing options.headers to override
    combinedHeaders = { ...combinedHeaders, ...options.headers };

    const response = await fetch(url, { ...options, headers: combinedHeaders });

    if (response.status === 401) {
      this.logout();
      if (typeof this.unauthorizedCallback === 'function') {
        this.unauthorizedCallback(); // Notify context/provider
      }
    }

    return response;
  }

  static hasRole(requiredRoles = []) {
    const user = this.getUser();
    return user && requiredRoles.includes(user.role);
  }
}

export default AuthService;