import React from 'react';
import ReactDOM from 'react-dom/client';

import '../styles.css';
import '../styles/preview.css';
import { DesignSystemPreview } from './DesignSystemPreview.js';

if (!import.meta.env.DEV) {
  throw new Error('The HireMe design-system preview is available in development only.');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DesignSystemPreview />
  </React.StrictMode>,
);
