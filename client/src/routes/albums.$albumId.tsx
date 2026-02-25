import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const AlbumDetailPage = lazy(() =>
  import('@/components/albums/album-detail-page').then((m) => ({
    default: m.AlbumDetailPage,
  })),
);

export const Route = createFileRoute('/albums/$albumId')({
  component: AlbumDetailPage,
});
