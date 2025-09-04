import  { useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, Outlet, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.js';
import AdminPage from './pages/AdminPage.js';
import BatchPage from './pages/BatchPage.js';
import ChatViewer from './pages/ChatViewer.js';
import SignupPage from './pages/SignupPage.js';
import LoginPage from './pages/LoginPage.js';
import LogoutPage from './pages/LogoutPage.js';
import { GcdsHeader, GcdsBreadcrumbs, GcdsFooter } from '@cdssnc/gcds-components-react';
import './styles/App.css';
import UsersPage from './pages/UsersPage.js';
import EvalPage from './pages/EvalPage.js';
import DatabasePage from './pages/DatabasePage.js';
import SettingsPage from './pages/SettingsPage.js';
import VectorPage from './pages/VectorPage.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { RoleProtectedRoute } from './components/RoleProtectedRoute.js';
import MetricsPage from './pages/MetricsPage.js';
import PublicEvalPage from './pages/PublicEvalPage.js';

// Helper function to get alternate language path
const getAlternatePath = (currentPath, currentLang) => {
  const newLang = currentLang === 'en' ? 'fr' : 'en';
  if (currentPath === '/' || currentPath === '/fr') {
    return `/${newLang}`;
  }
  // Remove leading language identifier if it exists and add new one
  const pathWithoutLang = currentPath.replace(/^\/(en|fr)/, '');
  return `/${newLang}${pathWithoutLang}`;
};

const AppLayout = () => {
  const location = useLocation();
  const currentLang = location.pathname.startsWith('/fr') ? 'fr' : 'en';
  const alternateLangHref = getAlternatePath(location.pathname, currentLang);

  useEffect(() => {
    // Removed the auth expiration checker setup
  }, []);

  // Update Open Graph meta tags based on current language
  useEffect(() => {
    const ogImage = currentLang === 'fr' ? 'og-image-fr.png' : 'og-image-en.png';
    
    // Update og:image meta tag
    let ogImageMeta = document.querySelector('meta[property="og:image"]');
    if (ogImageMeta) {
      ogImageMeta.setAttribute('content', ogImage);
    }
    
    // Update twitter:image meta tag
    let twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
    if (twitterImageMeta) {
      twitterImageMeta.setAttribute('content', ogImage);
    }
  }, [currentLang]);

  return (
    <>
      <section className="alpha-top">
        <div className="container">
          <small>
            <span className="alpha-label">Alpha</span>&nbsp;&nbsp;
            {currentLang === 'en'
              ? 'Experimental page - not public.'
              : 'Page expérimentale - non publique.'}
          </small>
        </div>
      </section>
      <GcdsHeader 
        lang={currentLang} 
        langHref={alternateLangHref} 
        skipToHref="#main-content"
      >
        <GcdsBreadcrumbs slot="breadcrumb">
          {/* Add breadcrumb items as needed */}
        </GcdsBreadcrumbs>
      </GcdsHeader>
      <main id="main-content">
        {/* Outlet will be replaced by the matching route's element */}
        <Outlet />
      </main>
      <GcdsFooter display="compact" lang={currentLang} />
    </>
  );
};

export default function App() {
  const router = useMemo(() => {
    const homeEn = <HomePage lang="en" />;
    const homeFr = <HomePage lang="fr" />;
    const publicRoutes = [
      { path: '/', element: homeEn },
      { path: '/en', element: homeEn },
      { path: '/fr', element: homeFr },
      { path: '/en/signin', element: <LoginPage lang="en" /> },
      { path: '/fr/signin', element: <LoginPage lang="fr" /> },
      { path: '/en/signup', element: <SignupPage lang="en" /> },
      { path: '/fr/signup', element: <SignupPage lang="fr" /> },
      { path: '/en/logout', element: <LogoutPage lang="en" /> },
      { path: '/fr/logout', element: <LogoutPage lang="fr" /> }
    ];

    const protectedRoutes = [
      { path: '/en/admin', element: <AdminPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/admin', element: <AdminPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/batch', element: <BatchPage lang="en" />, roles: ['admin'] },
      { path: '/fr/batch', element: <BatchPage lang="fr" />, roles: ['admin'] },
      { path: '/en/chat-viewer', element: <ChatViewer lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/chat-viewer', element: <ChatViewer lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/users', element: <UsersPage lang="en" />, roles: ['admin'] },
      { path: '/fr/users', element: <UsersPage lang="fr" />, roles: ['admin'] },
      { path: '/en/eval', element: <EvalPage lang="en" />, roles: ['admin'] },
      { path: '/fr/eval', element: <EvalPage lang="fr" />, roles: ['admin'] },
      { path: '/en/public-eval', element: <PublicEvalPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/public-eval', element: <PublicEvalPage lang="fr" />, roles: ['admin', 'partner'] },
      { path: '/en/metrics', element: <MetricsPage lang="en" />, roles: ['admin', 'partner'] },
      { path: '/fr/metrics', element: <MetricsPage lang="fr" />, roles: ['admin', 'partner'] },
    { path: '/en/settings', element: <SettingsPage lang="en" />, roles: ['admin'] },
    { path: '/fr/settings', element: <SettingsPage lang="fr" />, roles: ['admin'] },
    { path: '/en/database', element: <DatabasePage lang="en" />, roles: ['admin'] },
    { path: '/fr/database', element: <DatabasePage lang="fr" />, roles: ['admin'] },
    { path: '/en/vector', element: <VectorPage lang="en" />, roles: ['admin'] },
    { path: '/fr/vector', element: <VectorPage lang="fr" />, roles: ['admin'] }
    ];

    return createBrowserRouter([
      {
        element: (
          <AuthProvider>
            <AppLayout />
          </AuthProvider>
        ),
        children: [
          ...publicRoutes,
          ...protectedRoutes.map(route => ({
            path: route.path,
            element: (
              <RoleProtectedRoute roles={route.roles} lang={route.path.includes('/fr/') ? 'fr' : 'en'}>
                {route.element}
              </RoleProtectedRoute>
            )
          }))
        ]
      }
    ]);
  }, []);

  return (
    <RouterProvider router={router} />
  );
}