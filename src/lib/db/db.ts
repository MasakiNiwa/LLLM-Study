/**
 * 学習データのデータベース（IndexedDB / Dexie）。
 * メインスレッドと Data Worker の両方から使う（IndexedDB はスレッド間で共有される）。
 */
import Dexie, { type EntityTable } from 'dexie';
import { STORAGE_PREFIX } from '@/lib/constants';
import type {
  CardRecord,
  ChatRecord,
  ItemRecord,
  MetaRecord,
  PackRecord,
  ReviewRecord,
} from './types';

export class StudyDb extends Dexie {
  packs!: EntityTable<PackRecord, 'id'>;
  items!: EntityTable<ItemRecord, 'key'>;
  cards!: EntityTable<CardRecord, 'id'>;
  reviews!: EntityTable<ReviewRecord, 'id'>;
  chat!: EntityTable<ChatRecord, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor(name = STORAGE_PREFIX) {
    super(name);
    this.version(1).stores({
      packs: '&id, order',
      items: '&key, packId',
      cards: '&id, packId, itemKey, due, state, [packId+state]',
      reviews: '++id, cardId, itemKey, day, review',
      chat: '&id, createdAt',
      meta: '&key',
    });
  }
}

export const db = new StudyDb();
