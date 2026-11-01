/**
 * 学習データのデータベース（IndexedDB / Dexie）。
 * メインスレッドと Data Worker の両方から使う（IndexedDB はスレッド間で共有される）。
 */
import Dexie, { type EntityTable } from 'dexie';
import { STORAGE_PREFIX } from '@/lib/constants';
import type {
  CardRecord,
  ChatRecord,
  ThreadRecord,
  ItemRecord,
  MetaRecord,
  PackRecord,
  ReviewRecord,
} from './types';

/** v1.12 より前のチャットをまとめるスレッド */
export const LEGACY_THREAD_ID = 'thread-legacy';
export const LEGACY_THREAD_TITLE = 'これまでのチャット';

export class StudyDb extends Dexie {
  packs!: EntityTable<PackRecord, 'id'>;
  items!: EntityTable<ItemRecord, 'key'>;
  cards!: EntityTable<CardRecord, 'id'>;
  reviews!: EntityTable<ReviewRecord, 'id'>;
  chat!: EntityTable<ChatRecord, 'id'>;
  threads!: EntityTable<ThreadRecord, 'id'>;
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
    // v2: チャットをスレッドに分ける。これまでの会話は 1 つのスレッド「これまでのチャット」にまとめる
    this.version(2)
      .stores({ chat: '&id, createdAt, threadId', threads: '&id, updatedAt' })
      .upgrade(async (tx) => {
        const chat = tx.table<ChatRecord, string>('chat');
        const records = await chat.orderBy('createdAt').toArray();
        if (!records.length) return;
        await chat.toCollection().modify({ threadId: LEGACY_THREAD_ID });
        await tx.table<ThreadRecord, string>('threads').add({
          id: LEGACY_THREAD_ID,
          title: LEGACY_THREAD_TITLE,
          createdAt: records[0].createdAt,
          updatedAt: records[records.length - 1].createdAt,
        });
      });
  }
}

export const db = new StudyDb();
