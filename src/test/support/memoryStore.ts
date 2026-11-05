/**
 * In-memory DocStore for server unit tests (see api/_lib/store.ts for the contract).
 *
 * Mirrors the Firestore semantics the business logic relies on:
 *  - transactions are serialised and atomic (writes buffered, applied on commit,
 *    discarded if the callback throws);
 *  - reading after writing inside a transaction is an error (Firestore requires
 *    all reads first), which catches ordering bugs in the code under test;
 *  - `create` fails if the document exists; `update` fails if it does not;
 *  - Increment / ArrayUnion are applied to the committed value.
 */
import crypto from 'crypto';
import {
  AlreadyExistsError,
  ArrayUnion,
  Increment,
  type DocData,
  type DocStore,
  type QueryOptions,
  type StoreTransaction,
} from '../../../api/_lib/store';

type WriteOp =
  | { kind: 'create' | 'set' | 'update'; path: string; data: DocData; merge?: boolean }
  | { kind: 'delete'; path: string };

const clone = <T>(value: T): T => structuredClone(value);

function applyFields(base: DocData, data: DocData): DocData {
  const out: DocData = { ...base };
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Increment) {
      out[key] = (typeof out[key] === 'number' ? (out[key] as number) : 0) + value.by;
    } else if (value instanceof ArrayUnion) {
      const current = Array.isArray(out[key]) ? [...(out[key] as unknown[])] : [];
      for (const v of value.values) {
        if (!current.some(c => JSON.stringify(c) === JSON.stringify(v))) current.push(clone(v));
      }
      out[key] = current;
    } else if (value !== undefined) {
      out[key] = clone(value);
    }
  }
  return out;
}

export class MemoryStore implements DocStore {
  readonly docs = new Map<string, DocData>();
  private lock: Promise<unknown> = Promise.resolve();
  private idCounter = 0;
  /** Set to make the next N transactions throw before committing (simulates Firestore outages). */
  failNextTransactions = 0;

  seed(path: string, data: DocData) {
    this.docs.set(path, clone(data));
  }

  read(path: string): DocData | undefined {
    const doc = this.docs.get(path);
    return doc ? clone(doc) : undefined;
  }

  collection(name: string): Array<{ id: string; data: DocData }> {
    return [...this.docs.entries()]
      .filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === name.split('/').length + 1)
      .map(([path, data]) => ({ id: path.split('/').pop()!, data: clone(data) }));
  }

  newId(): string {
    this.idCounter += 1;
    return `${crypto.randomBytes(8).toString('hex')}${String(this.idCounter).padStart(4, '0')}`;
  }

  private static apply(docs: Map<string, DocData>, op: WriteOp) {
    const existing = docs.get(op.path);
    switch (op.kind) {
      case 'create':
        if (existing) throw new AlreadyExistsError(op.path);
        docs.set(op.path, applyFields({}, op.data));
        break;
      case 'set':
        docs.set(op.path, applyFields(op.merge && existing ? existing : {}, op.data));
        break;
      case 'update':
        if (!existing) throw new Error(`NOT_FOUND: ${op.path}`);
        docs.set(op.path, applyFields(existing, op.data));
        break;
      case 'delete':
        docs.delete(op.path);
        break;
    }
  }

  /** Applies all ops to a staged copy and swaps it in, so a failing op leaves no partial commit. */
  private commit(ops: WriteOp[]) {
    const staged = new Map(this.docs);
    for (const op of ops) MemoryStore.apply(staged, op);
    for (const op of ops) {
      const doc = staged.get(op.path);
      if (doc) this.docs.set(op.path, doc);
      else this.docs.delete(op.path);
    }
  }

  async get(path: string) {
    return this.read(path) ?? null;
  }
  async create(path: string, data: DocData) {
    this.commit([{ kind: 'create', path, data }]);
  }
  async set(path: string, data: DocData, options?: { merge?: boolean }) {
    this.commit([{ kind: 'set', path, data, merge: options?.merge }]);
  }
  async update(path: string, data: DocData) {
    this.commit([{ kind: 'update', path, data }]);
  }
  async delete(path: string) {
    this.commit([{ kind: 'delete', path }]);
  }

  async query(collection: string, options: QueryOptions = {}) {
    let rows = this.collection(collection);
    for (const f of options.where ?? []) {
      rows = rows.filter(r => {
        const v = r.data[f.field] as number | string;
        const target = f.value as number | string;
        switch (f.op) {
          case '==': return v === target;
          case '<': return v < target;
          case '<=': return v <= target;
          case '>': return v > target;
          case '>=': return v >= target;
        }
      });
    }
    if (options.orderBy) {
      const { field, direction } = options.orderBy;
      const dir = direction === 'desc' ? -1 : 1;
      rows.sort((a, b) => ((a.data[field] as number) > (b.data[field] as number) ? dir : -dir));
    }
    return options.limit ? rows.slice(0, options.limit) : rows;
  }

  runTransaction<T>(fn: (tx: StoreTransaction) => Promise<T>): Promise<T> {
    const run = async () => {
      const ops: WriteOp[] = [];
      const tx: StoreTransaction = {
        get: async path => {
          if (ops.length > 0) throw new Error(`Transaction read of ${path} after a write`);
          return this.read(path) ?? null;
        },
        create: (path, data) => void ops.push({ kind: 'create', path, data }),
        set: (path, data, options) => void ops.push({ kind: 'set', path, data, merge: options?.merge }),
        update: (path, data) => void ops.push({ kind: 'update', path, data }),
        delete: path => void ops.push({ kind: 'delete', path }),
      };
      const result = await fn(tx);
      if (this.failNextTransactions > 0) {
        this.failNextTransactions -= 1;
        throw new Error('Simulated Firestore commit failure');
      }
      this.commit(ops);
      return result;
    };
    const next = this.lock.then(run, run);
    this.lock = next.catch(() => undefined);
    return next;
  }
}
