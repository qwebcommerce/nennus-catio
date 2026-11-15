import type { LocalisedText, PetLabel } from "@nennus-catio/contracts";

/**
 * A booked pet as staff and customers see it (D246): "Small pet · Persian", or the group alone when no
 * breed was given. The pet's name is no longer asked.
 */
export function petLabel(pet: PetLabel, local: (text: LocalisedText) => string): string {
  return pet.breed ? `${local(pet.group)} · ${pet.breed}` : local(pet.group);
}
