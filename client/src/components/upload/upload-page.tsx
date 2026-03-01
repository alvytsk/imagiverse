import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from 'imagiverse-shared';
import type { PhotoVisibility } from 'imagiverse-shared';
import { Eye, EyeOff, ImagePlus, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useCategories } from '@/hooks/use-categories';
import { ApiClientError } from '@/lib/api-client';
import { resizeImageForUpload } from '@/lib/image-resize';
import { useAuthStore } from '@/stores/auth-store';

export function UploadPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: categoriesList } = useCategories();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [visibility, setVisibility] = useState<PhotoVisibility>('public');
  const [isResizing, setIsResizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!ALLOWED_MIME_TYPES.includes(f.type as (typeof ALLOWED_MIME_TYPES)[number])) {
      toast.error('Invalid file type. Use JPEG, PNG, WebP, or HEIC.');
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      toast.error('File too large. Maximum size is 20 MB.');
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const removeFile = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
  }, [preview]);

  const handleUpload = async () => {
    if (!file) return;

    setIsResizing(true);
    let processedFile: File;
    try {
      processedFile = await resizeImageForUpload(file);
    } catch {
      processedFile = file;
    } finally {
      setIsResizing(false);
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', processedFile);
      if (caption.trim()) {
        formData.append('caption', caption.trim());
      }
      if (categoryId) {
        formData.append('categoryId', categoryId);
      }
      formData.append('visibility', visibility);

      const token = useAuthStore.getState().accessToken;
      const res = await fetch('/api/photos', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json();
        throw new ApiClientError(
          res.status,
          body.error?.code ?? 'UPLOAD_FAILED',
          body.error?.message ?? 'Upload failed',
        );
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['photos'] });
      toast.success('Photo uploaded! It will appear once processing is complete.');
      navigate({
        to: '/photos/$photoId',
        params: { photoId: data.id },
        state: { localPreview: preview } as Record<string, unknown>,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Upload failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumbs items={[{ label: 'Upload' }]} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload a photo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!file ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Select photo to upload"
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 transition-all duration-200 cursor-pointer ${
                dragActive
                  ? 'border-primary bg-primary/10 scale-[1.02]'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <ImagePlus className="h-16 w-16 text-primary/50 mb-4" />
              <p className="text-lg font-medium mb-1">
                Drop your image here or click to browse
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                Supports JPEG, PNG, WebP, HEIC
              </p>
              <div className="flex gap-2">
                {['JPEG', 'PNG', 'WebP', 'HEIC'].map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED_MIME_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          ) : (
            <div className="relative rounded-2xl bg-muted/30 dark:bg-muted/10 overflow-hidden flex items-center justify-center min-h-[200px]">
              <img
                src={preview!}
                alt="Preview"
                className="max-w-full max-h-[500px] object-contain"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={removeFile}
                aria-label="Remove selected photo"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="caption">
              Caption (optional)
            </label>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Tell us about this photo..."
              maxLength={2000}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">
              {caption.length}/2000
            </p>
          </div>

          {categoriesList && categoriesList.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="category">
                Category (optional)
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">No category</option>
                {categoriesList.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant={visibility === 'public' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVisibility('public')}
              className="flex-1"
            >
              <Eye className="h-4 w-4 mr-1.5" />
              Public
            </Button>
            <Button
              type="button"
              variant={visibility === 'private' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVisibility('private')}
              className="flex-1"
            >
              <EyeOff className="h-4 w-4 mr-1.5" />
              Private
            </Button>
          </div>
          {visibility === 'private' && (
            <p className="text-xs text-muted-foreground">
              This photo will only be visible to you.
            </p>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleUpload}
            disabled={!file || isResizing || isUploading}
            isLoading={isResizing || isUploading}
          >
            {isResizing ? 'Resizing...' : 'Upload photo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
