import { RouterProvider, createRouter } from '@tanstack/react-router';
import React, { StrictMode } from 'react';
import * as ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';

import './index.css';
import { rehydrateAuth } from './stores/auth-store';
import { initThemeListener } from './stores/theme-store';
import { routeTree } from './routeTree.gen';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => axe.default(React, ReactDOM, 1000));
}

initThemeListener();

// Rehydrate auth session before mounting React.
// This must happen outside the React tree to avoid StrictMode
// double-firing the effect, which would trigger token rotation
// twice and cause the server to revoke the session.
rehydrateAuth().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
});
