import { Flag } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useReportPhoto } from '@/hooks/use-photo';

export function ReportDialog({ photoId }: { photoId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const reportMutation = useReportPhoto(photoId);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    await reportMutation.mutateAsync(reason.trim());
    setReason('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Flag className="h-4 w-4 mr-1" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report photo</DialogTitle>
          <DialogDescription>
            Please describe why you think this photo violates our guidelines.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the issue..."
            maxLength={1000}
            rows={4}
          />
          <p className="text-xs text-muted-foreground text-right">
            {reason.length}/1000
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || reportMutation.isPending}
            isLoading={reportMutation.isPending}
          >
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
