import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const PhotoDetailPage = lazy(() =>
  import('@/components/photos/photo-detail-page').then((m) => ({
    default: m.PhotoDetailPage,
  })),
);

export const Route = createFileRoute('/photos/$photoId')({
  component: PhotoDetailPage,
});
