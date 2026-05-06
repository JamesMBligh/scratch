import type { Adventure } from '../types';

/** Metadata + a lazy loader for an adventure. New games can be added here. */
export interface AdventureCatalogEntry {
  id: string;
  title: string;
  description: string;
  author?: string;
  /** Loads the full adventure definition. Use dynamic imports for code-splitting. */
  load: () => Promise<Adventure>;
}

export const adventureCatalog: AdventureCatalogEntry[] = [
  {
    id: 'cabin',
    title: 'The Cabin in the Clearing',
    description:
      'A short demo. Find your way into a moonlit cabin and discover what waits below.',
    author: 'Sample',
    load: async () => (await import('./cabin.json')).default as Adventure,
  },
];

export function findAdventure(id: string): AdventureCatalogEntry | undefined {
  return adventureCatalog.find((a) => a.id === id);
}
