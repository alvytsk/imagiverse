import type { CategoryResponse } from 'imagiverse-shared';

interface CategoryFilterBarProps {
  categories: CategoryResponse[];
  selected?: string;
  onSelect: (slug: string | undefined) => void;
}

export function CategoryFilterBar({ categories, selected, onSelect }: CategoryFilterBarProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none -mx-1 px-1">
      <button
        type="button"
        onClick={() => onSelect(undefined)}
        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
          !selected
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onSelect(cat.slug === selected ? undefined : cat.slug)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            selected === cat.slug
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
