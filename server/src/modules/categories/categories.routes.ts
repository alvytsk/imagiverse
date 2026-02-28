import type { FastifyInstance } from 'fastify';
import type { CategoryResponse } from 'imagiverse-shared';
import { getAllCategories } from './categories.service';

export async function categoriesRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /categories ────────────────────────────────────────────────────────
  fastify.get('/categories', {
    handler: async (_request, reply) => {
      const rows = await getAllCategories();
      const data: CategoryResponse[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        displayOrder: r.displayOrder,
        iconName: r.iconName,
      }));
      return reply.send({ data });
    },
  });
}
