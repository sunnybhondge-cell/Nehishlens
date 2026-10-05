import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import './styles/legacy.css';
import './styles/theme-dark.css';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { LensProvider } from './context/LensContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <LensProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </LensProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
