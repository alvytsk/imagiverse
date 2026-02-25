import type { AlbumResponse } from 'imagiverse-shared';
import { UpdateAlbumSchema } from 'imagiverse-shared';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateAlbum } from '@/hooks/use-albums';

export function EditAlbumDialog({
  album,
  open,
  onOpenChange,
}: {
  album: AlbumResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(album.name);
  const [description, setDescription] = useState(album.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const updateAlbum = useUpdateAlbum(album.id);

  const handleSubmit = async () => {
    const input: Record<string, unknown> = {};
    if (name.trim() !== album.name) input.name = name.trim();
    const newDesc = description.trim() || null;
    if (newDesc !== album.description) input.description = newDesc;

    if (Object.keys(input).length === 0) {
      onOpenChange(false);
      return;
    }

    const result = UpdateAlbumSchema.safeParse(input);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    await updateAlbum.mutateAsync(result.data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit album</DialogTitle>
          <DialogDescription>
            Update the album name or description.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-album-name">Name</Label>
            <Input
              id="edit-album-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-album-desc">Description</Label>
            <Textarea
              id="edit-album-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this album about?"
              maxLength={500}
              rows={3}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || updateAlbum.isPending}
            isLoading={updateAlbum.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
