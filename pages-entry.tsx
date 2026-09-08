import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from '@/components/dashboard';
import '@/app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
);
