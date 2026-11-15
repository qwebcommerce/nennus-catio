import type { CustomerRelocationRequest, LocalisedText, RelocationOptions } from "@nennus-catio/contracts";

type DocumentType = RelocationOptions["documentTypes"][number];

/** One document the form offers to upload now: a type for one pet, or for the whole request. */
export interface FormDocument {
  /** `typeId:petKey`, or `typeId:request`. */
  key: string;
  type: DocumentType;
  /** The pet's place in the form's list, or null for a document of the whole request. */
  petIndex: number | null;
}

/** The owner's list as the request will ask it (15a's submit): one per pet for a per-pet type, one otherwise. */
export function formDocuments(types: readonly DocumentType[], petKeys: readonly string[]): FormDocument[] {
  const documents: FormDocument[] = [];
  for (const type of types) {
    if (!type.perPet) {
      documents.push({ key: `${type.id}:request`, type, petIndex: null });
      continue;
    }
    for (const [petIndex, petKey] of petKeys.entries()) documents.push({ key: `${type.id}:${petKey}`, type, petIndex });
  }
  return documents;
}

const sameName = (a: LocalisedText, b: LocalisedText) => a.en === b.en && a.ar === b.ar;

/**
 * Which of the new request's documents each file chosen in the form belongs to: the same type (the
 * request keeps a copy of its names) for the same pet (the request keeps the pets in the form's order).
 * A file whose document is not found (the owner renamed the type meanwhile) is counted, so the request
 * page can ask for it again.
 */
export function matchChosenFiles(
  request: Pick<CustomerRelocationRequest, "pets" | "documents">,
  chosen: readonly { document: FormDocument; file: File }[],
): { files: { slotId: string; file: File }[]; unmatched: number } {
  const used = new Set<string>();
  const files: { slotId: string; file: File }[] = [];
  let unmatched = 0;
  for (const { document, file } of chosen) {
    const petId = document.petIndex === null ? null : request.pets[document.petIndex]?.id;
    const slot = request.documents.find(
      (candidate) => !used.has(candidate.id) && sameName(candidate.name, document.type.name) && (candidate.pet?.id ?? null) === petId,
    );
    if (slot) {
      used.add(slot.id);
      files.push({ slotId: slot.id, file });
    } else {
      unmatched += 1;
    }
  }
  return { files, unmatched };
}
