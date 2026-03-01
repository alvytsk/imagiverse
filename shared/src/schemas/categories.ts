import { z } from 'zod';

export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  iconName: string | null;
}

export const UpdatePhotoCategorySchema = z.object({
  categoryId: z.string().uuid().nullable(),
});

export type UpdatePhotoCategoryInput = z.infer<typeof UpdatePhotoCategorySchema>;
