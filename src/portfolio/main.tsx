import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import { AuthProvider } from '@/lib/auth';
import { PortfolioUIProvider } from './uiState';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <PortfolioUIProvider>
        <App />
      </PortfolioUIProvider>
    </AuthProvider>
  </StrictMode>,
);
