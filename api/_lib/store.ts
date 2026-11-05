/**
 * Minimal document-store port used by the server's business logic.
 *
 * Checkout, payment and reservation logic is written against this interface
 * instead of the Firestore SDK so it can be unit-tested against an in-memory
 * implementation (src/test/support/memoryStore.ts) with the same semantics:
 * transactions are atomic, all reads happen before writes, `create` fails if the
 * document exists, and Increment / ArrayUnion are applied atomically.
 *
 * Production uses createFirestoreStore() over the Admin SDK.
 */
import { FieldValue, type Firestore, type Query, type Transaction, type UpdateData, type WhereFilterOp } from 'firebase-admin/firestore';

export type DocData = Record<string, unknown>;

/** Atomic numeric increment of a top-level field (FieldValue.increment). */
export class Increment {
  constructor(readonly by: number) {}
}
/** Atomic append-unique to a top-level array field (FieldValue.arrayUnion). */
export class ArrayUnion {
  readonly values: unknown[];
  constructor(...values: unknown[]) {
    this.values = values;
  }
}

export const increment = (by: number) => new Increment(by);
export const arrayUnion = (...values: unknown[]) => new ArrayUnion(...values);

export class AlreadyExistsError extends Error {
  constructor(readonly path: string) {
    super(`Document already exists: ${path}`);
    this.name = 'AlreadyExistsError';
  }
}

export interface StoreTransaction {
  get(path: string): Promise<DocData | null>;
  create(path: string, data: DocData): void;
  set(path: string, data: DocData, options?: { merge?: boolean }): void;
  update(path: string, data: DocData): void;
  delete(path: string): void;
}

export interface QueryFilter {
  field: string;
  op: '==' | '<' | '<=' | '>' | '>=';
  value: unknown;
}

export interface QueryOptions {
  where?: QueryFilter[];
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface QueryResult {
  id: string;
  data: DocData;
}

export interface DocStore {
  newId(collection: string): string;
  get(path: string): Promise<DocData | null>;
  /** Throws AlreadyExistsError if the document exists. */
  create(path: string, data: DocData): Promise<void>;
  set(path: string, data: DocData, options?: { merge?: boolean }): Promise<void>;
  update(path: string, data: DocData): Promise<void>;
  delete(path: string): Promise<void>;
  query(collection: string, options?: QueryOptions): Promise<QueryResult[]>;
  runTransaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T>;
}

function toFirestoreData(data: DocData): DocData {
  const out: DocData = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Increment) out[key] = FieldValue.increment(value.by);
    else if (value instanceof ArrayUnion) out[key] = FieldValue.arrayUnion(...value.values);
    else out[key] = value;
  }
  return out;
}

// gRPC status 6 = ALREADY_EXISTS
const isAlreadyExists = (err: unknown) => (err as { code?: unknown })?.code === 6;

export function createFirestoreStore(db: Firestore): DocStore {
  const wrapTx = (tx: Transaction): StoreTransaction => ({
    async get(path) {
      const snap = await tx.get(db.doc(path));
      return snap.exists ? (snap.data() as DocData) : null;
    },
    create(path, data) {
      tx.create(db.doc(path), toFirestoreData(data));
    },
    set(path, data, options) {
      tx.set(db.doc(path), toFirestoreData(data), { merge: options?.merge ?? false });
    },
    update(path, data) {
      tx.update(db.doc(path), toFirestoreData(data) as UpdateData<DocData>);
    },
    delete(path) {
      tx.delete(db.doc(path));
    },
  });

  return {
    newId: collection => db.collection(collection).doc().id,
    async get(path) {
      const snap = await db.doc(path).get();
      return snap.exists ? (snap.data() as DocData) : null;
    },
    async create(path, data) {
      try {
        await db.doc(path).create(toFirestoreData(data));
      } catch (err) {
        if (isAlreadyExists(err)) throw new AlreadyExistsError(path);
        throw err;
      }
    },
    async set(path, data, options) {
      await db.doc(path).set(toFirestoreData(data), { merge: options?.merge ?? false });
    },
    async update(path, data) {
      await db.doc(path).update(toFirestoreData(data) as UpdateData<DocData>);
    },
    async delete(path) {
      await db.doc(path).delete();
    },
    async query(collection, options = {}) {
      let q: Query = db.collection(collection);
      for (const f of options.where ?? []) q = q.where(f.field, f.op as WhereFilterOp, f.value);
      if (options.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.direction ?? 'asc');
      if (options.limit) q = q.limit(options.limit);
      const snap = await q.get();
      return snap.docs.map(d => ({ id: d.id, data: d.data() as DocData }));
    },
    async runTransaction(fn) {
      try {
        return await db.runTransaction(tx => fn(wrapTx(tx)));
      } catch (err) {
        if (isAlreadyExists(err)) throw new AlreadyExistsError('transaction create');
        throw err;
      }
    },
  };
}
