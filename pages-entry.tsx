import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '@/components/dashboard';
import DashboardBoundary from '@/components/dashboard-boundary';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DashboardBoundary>
      <Dashboard />
    </DashboardBoundary>
  </React.StrictMode>,
);
