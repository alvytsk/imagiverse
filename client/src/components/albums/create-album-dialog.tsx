import { CreateAlbumSchema } from 'imagiverse-shared';
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
import { useCreateAlbum } from '@/hooks/use-albums';

export function CreateAlbumDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const createAlbum = useCreateAlbum();

  const handleSubmit = async () => {
    const result = CreateAlbumSchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
    });

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
    await createAlbum.mutateAsync(result.data);
    setName('');
    setDescription('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create album</DialogTitle>
          <DialogDescription>
            Organize your photos into a collection.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="album-name">Name</Label>
            <Input
              id="album-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My album"
              maxLength={100}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="album-desc">Description (optional)</Label>
            <Textarea
              id="album-desc"
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
            disabled={!name.trim() || createAlbum.isPending}
            isLoading={createAlbum.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
