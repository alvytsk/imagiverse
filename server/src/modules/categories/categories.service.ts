import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { categories } from '../../db/schema/index';

export async function getAllCategories() {
  return db.select().from(categories).orderBy(asc(categories.displayOrder));
}

export async function getCategoryBySlug(slug: string) {
  const [category] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return category ?? null;
}

export async function getCategoryById(id: string) {
  const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return category ?? null;
}
