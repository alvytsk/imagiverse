import { useNavigate } from '@tanstack/react-router';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from 'imagiverse-shared';
import { ImagePlus, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
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
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (caption.trim()) {
        formData.append('caption', caption.trim());
      }

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
      toast.success('Photo uploaded! It will appear once processing is complete.');
      navigate({ to: '/photos/$photoId', params: { photoId: data.id } });
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
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors cursor-pointer ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <ImagePlus className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">
                Drop your image here or click to browse
              </p>
              <p className="text-sm text-muted-foreground">
                JPEG, PNG, WebP, HEIC — up to 20 MB
              </p>
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
            <div className="relative">
              <img
                src={preview!}
                alt="Preview"
                className="w-full rounded-lg object-contain max-h-[500px]"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={removeFile}
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

          <Button
            className="w-full"
            size="lg"
            onClick={handleUpload}
            disabled={!file || isUploading}
            isLoading={isUploading}
          >
            Upload photo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
