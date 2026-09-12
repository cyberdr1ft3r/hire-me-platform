import React from 'react';
import ReactDOM from 'react-dom/client';

import { CandidatePreview } from './CandidatePreview.js';
import '../styles.css';
import './preview.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CandidatePreview />
  </React.StrictMode>,
);
