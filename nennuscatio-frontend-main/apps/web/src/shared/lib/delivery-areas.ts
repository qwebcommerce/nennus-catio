/** Delivery areas under their city headings (D135), cities in the order they first appear. */
export interface CityGroup<T> {
  cityId: string;
  city: { en: string; ar: string };
  areas: T[];
}

export function areasByCity<T extends { cityId: string; city: { en: string; ar: string } }>(areas: readonly T[]): CityGroup<T>[] {
  const groups = new Map<string, CityGroup<T>>();
  for (const area of areas) {
    const group = groups.get(area.cityId);
    if (group) group.areas.push(area);
    else groups.set(area.cityId, { cityId: area.cityId, city: area.city, areas: [area] });
  }
  return [...groups.values()];
}
