import type { PhotoStorage } from '../../../api/_lib/consultations';
import type { ReviewPhotoStorage } from '../../../api/_lib/reviewPhotos';

/** In-memory bucket for server tests: the set of object paths currently stored. */
export class FakeBucket implements PhotoStorage, ReviewPhotoStorage {
  readonly objects = new Set<string>();
  copies: Array<[string, string]> = [];
  fail = false;

  constructor(initial: string[] = []) {
    initial.forEach(path => this.objects.add(path));
  }

  async copy(from: string, to: string) {
    if (this.fail) throw new Error('storage down');
    if (!this.objects.has(from)) throw new Error(`no such object ${from}`);
    this.objects.add(to);
    this.copies.push([from, to]);
  }

  async exists(path: string) {
    return this.objects.has(path);
  }

  async delete(path: string) {
    if (this.fail) throw new Error('storage down');
    this.objects.delete(path);
  }
}
