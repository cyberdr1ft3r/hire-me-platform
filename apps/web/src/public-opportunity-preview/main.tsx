import React from 'react';
import ReactDOM from 'react-dom/client';

import { PublicOpportunityPreview } from './PublicOpportunityPreview.js';
import '../styles.css';
import './preview.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <PublicOpportunityPreview />
  </React.StrictMode>,
);
