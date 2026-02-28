import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Toaster } from 'sonner';

import { ErrorBoundary } from '@/components/error-boundary';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { queryClient } from '@/lib/query-client';
import { useResolvedTheme } from '@/stores/theme-store';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const resolvedTheme = useResolvedTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <div className="flex min-h-screen flex-col bg-background">
          <Navbar />
          <main className="container mx-auto flex-1 px-4 py-8 pb-16">
            <Suspense
              fallback={
                <div className="flex justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </main>
          <Footer />
        </div>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        theme={resolvedTheme}
        toastOptions={{ className: 'rounded-xl' }}
      />
    </QueryClientProvider>
  );
}
