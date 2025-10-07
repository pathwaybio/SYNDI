// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from '@shared/components/ui/toaster';
import { ThemeProvider } from '@shared/components/ThemeProvider';
import { UIConfigProvider } from '@shared/lib/ui-config-provider';
import { AuthProvider, useAuth } from '@shared/lib/auth';
import UserForm from '@sam/views/UserForm';
import Layout from '@shared/components/Layout';
import LoginPage from '@shared/views/LoginPage';
// import { SOPEditor } from './views/SOPEditor';
import { SOPCreatorPage } from '@sam/views/SOPCreatorPage';
import SOPListPage from '@claire/views/SOPListPage';
import SOPViewPage from '@claire/views/SOPViewPage';

import '../styles/globals.css';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: false,
    },
  },
});

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode; adminOnly?: boolean }> = ({ 
  children, 
  adminOnly = false 
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Debug logging
  useEffect(() => {
    console.log('ProtectedRoute check:', {
      path: location.pathname,
      isAuthenticated,
      isLoading,
      user: user?.username,
      adminOnly,
      isAdmin: user?.isAdmin
    });
  }, [location.pathname, isAuthenticated, isLoading, user, adminOnly]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('Not authenticated, redirecting to login from:', location.pathname);
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !user?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Access Denied</h1>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Main App Component
const App: React.FC = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <UIConfigProvider>
            <BrowserRouter 
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
            <Routes>
              {/* Root redirect to CLAIRE */}
              <Route path="/" element={<Navigate to="/claire" replace />} />
              
              <Route path="/login" element={<LoginPage />} />
              <Route path="/sam" element={
                <ProtectedRoute adminOnly>
                  <Layout>
                    <SOPCreatorPage />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/claire" element={
                <ProtectedRoute>
                  <Layout>
                    <SOPListPage />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="/claire/sop" element={
                <ProtectedRoute>
                  <Layout>
                    <SOPViewPage />
                  </Layout>
                </ProtectedRoute>
              } />
              <Route path="*" element={
                <div className="flex items-center justify-center min-h-screen">
                  <div className="text-center">
                    <h1 className="text-2xl font-bold mb-4">404 - Page Not Found</h1>
                    <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
                  </div>
                </div>
              } />
            </Routes>
            <Toaster />
          </BrowserRouter>
          </UIConfigProvider>
        </AuthProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </ThemeProvider>
  );
};

// Bootstrap the app
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);

export default App;
