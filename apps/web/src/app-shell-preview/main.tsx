import React from 'react';
import ReactDOM from 'react-dom/client';

import { AppShellPreview } from './AppShellPreview.js';
import '../styles.css';
import './preview.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShellPreview />
  </React.StrictMode>,
);
