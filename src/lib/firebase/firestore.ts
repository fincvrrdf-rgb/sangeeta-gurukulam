/**
 * lib/firebase/firestore.ts
 *
 * Typed Firestore helper functions for the Admin SDK.
 * These reduce boilerplate across services and enforce consistent
 * document shape handling. SERVER-ONLY.
 */

import { adminDb } from './admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

/**
 * Get a single document by collection and ID. Returns null if not found.
 */
export async function getDoc<T>(collection: string, id: string): Promise<T | null> {
  const snap = await adminDb.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as T;
}

/**
 * Get multiple documents by query. Returns typed array.
 */
export async function queryDocs<T>(
  collection: string,
  constraints: QueryConstraint[]
): Promise<T[]> {
  let ref: FirebaseFirestore.Query = adminDb.collection(collection);

  for (const c of constraints) {
    if (c.type === 'where') {
      ref = ref.where(c.field, c.op, c.value);
    } else if (c.type === 'orderBy') {
      ref = ref.orderBy(c.field, c.direction);
    } else if (c.type === 'limit') {
      ref = ref.limit(c.value);
    }
  }

  const snap = await ref.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as T);
}

export type QueryConstraint =
  | { type: 'where'; field: string; op: FirebaseFirestore.WhereFilterOp; value: unknown }
  | { type: 'orderBy'; field: string; direction?: 'asc' | 'desc' }
  | { type: 'limit'; value: number };

/**
 * Create a new document with auto-generated ID. Returns the new ID.
 */
export async function createDoc(collection: string, data: Record<string, unknown>): Promise<string> {
  const ref = await adminDb.collection(collection).add({
    ...data,
    createdAt: nowISO(),
  });
  return ref.id;
}

/**
 * Set (create or overwrite) a document with a specific ID.
 */
export async function setDoc(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  await adminDb.collection(collection).doc(id).set({
    ...data,
    updatedAt: nowISO(),
  });
}

/**
 * Merge-update specific fields on an existing document.
 */
export async function updateDoc(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  await adminDb.collection(collection).doc(id).update({
    ...data,
    updatedAt: nowISO(),
  });
}

/**
 * Delete a document.
 */
export async function deleteDoc(collection: string, id: string): Promise<void> {
  await adminDb.collection(collection).doc(id).delete();
}

/**
 * Run a Firestore transaction. Used for atomic operations like
 * violation counter updates and compulsory payment triggers.
 */
export async function runTransaction<T>(
  fn: (txn: FirebaseFirestore.Transaction) => Promise<T>
): Promise<T> {
  return adminDb.runTransaction(fn);
}

/**
 * Get a Firestore document reference (for use inside transactions).
 */
export function docRef(collection: string, id: string): FirebaseFirestore.DocumentReference {
  return adminDb.collection(collection).doc(id);
}

/**
 * Returns the current time as an ISO string. Used as the canonical
 * timestamp format in our domain model.
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Firestore server timestamp (for atomic writes where server time is needed).
 */
export function serverTimestamp(): FieldValue {
  return FieldValue.serverTimestamp();
}

/**
 * Convert a Firestore Timestamp to ISO string.
 */
export function timestampToISO(ts: Timestamp | null | undefined): string | null {
  if (!ts) return null;
  return ts.toDate().toISOString();
}
