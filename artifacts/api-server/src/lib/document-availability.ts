import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage";

const storage = new ObjectStorageService();
/** A database row is not proof that its backing file exists. Fail on storage outages. */
export async function storedDocuments<T extends { objectPath: string }>(documents: T[]): Promise<T[]> {
  const available: T[] = [];
  for (let offset = 0; offset < documents.length; offset += 6) {
    const batch = await Promise.all(documents.slice(offset, offset + 6).map(async doc => {
      try { await storage.getObjectEntityFile(doc.objectPath); return doc; }
      catch (error) { if (error instanceof ObjectNotFoundError) return null; throw error; }
    }));
    for (const doc of batch) if (doc !== null) available.push(doc as T);
  }
  return available;
}
