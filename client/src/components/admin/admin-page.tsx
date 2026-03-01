import type {
  AdminCommentResponse,
  AdminPhotoResponse,
  AdminUserResponse,
  ReportResponse,
} from 'imagiverse-shared';
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Camera,
  CheckCircle,
  Flag,
  MessageSquare,
  Shield,
  Trash2,
  Undo2,
  Users,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAdminComments,
  useAdminDeleteComment,
  useAdminDeletePhoto,
  useAdminPhotos,
  useAdminReports,
  useAdminStats,
  useAdminUsers,
  useBanUser,
  useResolveReport,
  useUnbanUser,
} from '@/hooks/use-admin';

type Tab = 'overview' | 'users' | 'photos' | 'reports' | 'comments';

export function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { id: 'photos', label: 'Photos', icon: <Camera className="h-4 w-4" /> },
    { id: 'reports', label: 'Reports', icon: <Flag className="h-4 w-4" /> },
    { id: 'comments', label: 'Comments', icon: <MessageSquare className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Breadcrumbs items={[{ label: 'Admin' }]} />
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'photos' && <PhotosTab />}
      {activeTab === 'reports' && <ReportsTab />}
      {activeTab === 'comments' && <CommentsTab />}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading || !stats) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>;
  }

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: <Users className="h-5 w-5 text-blue-500" /> },
    { label: 'Total Photos', value: stats.totalPhotos, icon: <Camera className="h-5 w-5 text-green-500" /> },
    { label: 'Total Comments', value: stats.totalComments, icon: <MessageSquare className="h-5 w-5 text-purple-500" /> },
    { label: 'Pending Reports', value: stats.pendingReports, icon: <Flag className="h-5 w-5 text-orange-500" />, alert: stats.pendingReports > 0 },
    { label: 'Flagged Comments', value: stats.flaggedComments, icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />, alert: stats.flaggedComments > 0 },
    { label: 'Banned Users', value: stats.bannedUsers, icon: <Ban className="h-5 w-5 text-red-500" /> },
    { label: 'Failed Photos', value: stats.failedPhotos, icon: <XCircle className="h-5 w-5 text-red-400" />, alert: stats.failedPhotos > 0 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label} className={card.alert ? 'border-orange-500/50' : ''}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Users ────────────────────────────────────────────────────────────────────

function UsersTab() {
  const [filter, setFilter] = useState<'all' | 'active' | 'banned'>('all');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useAdminUsers(filter);
  const banMutation = useBanUser();
  const unbanMutation = useUnbanUser();

  const allUsers = data?.pages.flatMap((p) => p.data) ?? [];

  const handleBan = (user: AdminUserResponse) => {
    banMutation.mutate(user.id, {
      onSuccess: () => toast.success(`${user.username} banned`),
      onError: () => toast.error('Failed to ban user'),
    });
  };

  const handleUnban = (user: AdminUserResponse) => {
    unbanMutation.mutate(user.id, {
      onSuccess: () => toast.success(`${user.username} unbanned`),
      onError: () => toast.error('Failed to unban user'),
    });
  };

  return (
    <div className="space-y-4">
      <FilterButtons
        options={['all', 'active', 'banned']}
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : allUsers.length === 0 ? (
        <EmptyState message="No users found" />
      ) : (
        <div className="space-y-2">
          {allUsers.map((user) => (
            <Card key={user.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.displayName}</p>
                    <span className="text-sm text-muted-foreground">@{user.username}</span>
                    {user.role === 'admin' && <Badge variant="secondary">Admin</Badge>}
                    {user.bannedAt && <Badge variant="destructive">Banned</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {user.email} · {user.photoCount} photos · joined {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  {user.bannedAt ? (
                    <Button size="sm" variant="outline" onClick={() => handleUnban(user)}>
                      <Undo2 className="mr-1 h-4 w-4" /> Unban
                    </Button>
                  ) : user.role !== 'admin' ? (
                    <Button size="sm" variant="destructive" onClick={() => handleBan(user)}>
                      <Ban className="mr-1 h-4 w-4" /> Ban
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Photos ───────────────────────────────────────────────────────────────────

function PhotosTab() {
  const [filter, setFilter] = useState<'all' | 'ready' | 'failed' | 'processing' | 'reported'>('all');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useAdminPhotos(filter);
  const deleteMutation = useAdminDeletePhoto();

  const allPhotos = data?.pages.flatMap((p) => p.data) ?? [];

  const handleDelete = (photo: AdminPhotoResponse) => {
    deleteMutation.mutate(photo.id, {
      onSuccess: () => toast.success('Photo deleted'),
      onError: () => toast.error('Failed to delete photo'),
    });
  };

  return (
    <div className="space-y-4">
      <FilterButtons
        options={['all', 'ready', 'failed', 'processing', 'reported']}
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : allPhotos.length === 0 ? (
        <EmptyState message="No photos found" />
      ) : (
        <div className="space-y-2">
          {allPhotos.map((photo) => (
            <Card key={photo.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{photo.caption || 'No caption'}</p>
                    <StatusBadge status={photo.status} />
                    {photo.reportCount > 0 && (
                      <Badge variant="destructive">{photo.reportCount} reports</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    by @{photo.username} · {photo.likeCount} likes · {photo.commentCount} comments · {new Date(photo.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(photo)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </CardContent>
            </Card>
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────

function ReportsTab() {
  const [filter, setFilter] = useState<'pending' | 'reviewed' | 'dismissed' | 'all'>('pending');
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useAdminReports(filter);
  const resolveMutation = useResolveReport();

  const allReports = data?.pages.flatMap((p) => p.data) ?? [];

  const handleResolve = (report: ReportResponse, status: 'reviewed' | 'dismissed') => {
    resolveMutation.mutate(
      { id: report.id, status },
      {
        onSuccess: () => toast.success(`Report ${status}`),
        onError: () => toast.error('Failed to resolve report'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <FilterButtons
        options={['pending', 'reviewed', 'dismissed', 'all']}
        value={filter}
        onChange={(v) => setFilter(v as typeof filter)}
      />

      {isLoading ? (
        <LoadingSpinner />
      ) : allReports.length === 0 ? (
        <EmptyState message="No reports found" />
      ) : (
        <div className="space-y-2">
          {allReports.map((report) => (
            <Card key={report.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Flag className="h-4 w-4 text-orange-500" />
                    <p className="font-medium">Photo reported</p>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Reported by @{report.reporterUsername} · {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm mt-1 bg-muted rounded px-2 py-1">{report.reason}</p>
                </div>
                {report.status === 'pending' && (
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => handleResolve(report, 'reviewed')}>
                      <CheckCircle className="mr-1 h-4 w-4" /> Reviewed
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleResolve(report, 'dismissed')}>
                      <XCircle className="mr-1 h-4 w-4" /> Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Comments ─────────────────────────────────────────────────────────────────

function CommentsTab() {
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useAdminComments(flaggedOnly);
  const deleteMutation = useAdminDeleteComment();

  const allComments = data?.pages.flatMap((p) => p.data) ?? [];

  const handleDelete = (comment: AdminCommentResponse) => {
    deleteMutation.mutate(comment.id, {
      onSuccess: () => toast.success('Comment deleted'),
      onError: () => toast.error('Failed to delete comment'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setFlaggedOnly(true)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            flaggedOnly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Flagged
        </button>
        <button
          onClick={() => setFlaggedOnly(false)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            !flaggedOnly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          All
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : allComments.length === 0 ? (
        <EmptyState message={flaggedOnly ? 'No flagged comments' : 'No comments found'} />
      ) : (
        <div className="space-y-2">
          {allComments.map((comment) => (
            <Card key={comment.id} className={comment.flagged ? 'border-yellow-500/50' : ''}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">@{comment.username}</p>
                    {comment.flagged && <Badge variant="outline" className="text-yellow-600 border-yellow-500">Spam</Badge>}
                  </div>
                  <p className="text-sm mt-1">{comment.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(comment.createdAt).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(comment)}>
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </CardContent>
            </Card>
          ))}
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared components ────────────────────────────────────────────────────────

function FilterButtons({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-colors ${
            value === opt
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    ready: { variant: 'secondary', label: 'Ready' },
    processing: { variant: 'outline', label: 'Processing' },
    failed: { variant: 'destructive', label: 'Failed' },
    deleted: { variant: 'destructive', label: 'Deleted' },
    pending: { variant: 'outline', label: 'Pending' },
    reviewed: { variant: 'secondary', label: 'Reviewed' },
    dismissed: { variant: 'default', label: 'Dismissed' },
  };
  const config = variants[status] ?? { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function LoadingSpinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <p className="text-lg">{message}</p>
    </div>
  );
}
