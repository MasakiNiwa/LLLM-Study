/**
 * クラウド AI の接続の状態（登録した API キーごと）。キーそのものは持たない（lib/cloud/keyVault.ts のメモリーにだけある）。
 * 会社（接続先）→ API キー（何本でも。個人用・仕事用など）→ モデル（マイモデル）の順に管理する。
 */
import { create } from 'zustand';
import {
  addKey,
  changePassphrase,
  createVault,
  deleteKey,
  deleteVault,
  getKeyEntry,
  getUnlockedKey,
  hasPasskey,
  hasPendingKey,
  holdPendingKey,
  isLegacyKey,
  isUnlocked,
  listKeys,
  lockVault,
  openVault,
  registerPasskey,
  removePasskey,
  storedKeyInfo,
  subscribeVault,
  takePendingKey,
  unlockLegacyKey,
  unlockWithPasskey,
  updateKeyEntry,
  vaultState,
  CLOUD_PROVIDER_ID_LIST,
  type CloudKeyId,
  type CloudProviderId,
  type KeyEntry,
} from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS, type CloudModel } from '@/lib/cloud/providers';
import { STORAGE_PREFIX } from '@/lib/constants';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';

/**
 * 保存のしかた。vault: アプリの合言葉で暗号化して保存（解除中でなければ passphrase で解除する。
 * まだ合言葉がなければ passphrase を合言葉にする）、session: 今回だけ
 */
export type SaveMode = { mode: 'vault'; passphrase?: string } | { mode: 'session' };

/** 画面に出す API キーの情報（キーそのものは含まない） */
export interface KeyInfo extends KeyEntry {
  /** 暗号化して保存したキー（末尾 4 文字と保存日時） */
  stored: { hint: string; savedAt: number } | null;
  /** 以前の形（キーごとの別の合言葉）で保存したキー */
  legacy: boolean;
  /** 解除済み（このタブで使える） */
  unlocked: boolean;
}

/** 取得したモデルの一覧（ロック中でも選べるよう、キーごとにこの端末に保存する） */
interface Catalog {
  fetchedAt: number;
  models: CloudModel[];
}

const CATALOG_KEY = `${STORAGE_PREFIX}:cloud-catalog`;

function readCatalogs(): Record<CloudKeyId, Catalog> {
  try {
    return (JSON.parse(localStorage.getItem(CATALOG_KEY) ?? '{}') as Record<string, Catalog>) ?? {};
  } catch {
    return {};
  }
}

function writeCatalogs(c: Record<CloudKeyId, Catalog>) {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(c));
  } catch {
    // 入りきらないときは保存しない（次に開いたときに取り直す）
  }
}

interface CloudState {
  /** アプリの合言葉の状態（none: まだ決めていない、locked: ロック中、open: 解除中） */
  vault: 'none' | 'locked' | 'open';
  /** 生体認証（パスキー）を登録済み */
  passkey: boolean;
  keys: KeyInfo[];
  /** ログインで受け取った、まだ保存していないキーがある */
  pending: Record<CloudProviderId, boolean>;
  catalogs: Record<CloudKeyId, Catalog>;
  modelsError: Record<CloudKeyId, string | null>;
  checking: CloudKeyId | null;

  /** キーを確かめて（モデルの一覧を取って）から登録する。戻り値は登録したキーの id */
  addKey: (
    provider: CloudProviderId,
    apiKey: string,
    save: SaveMode,
    label?: string,
  ) => Promise<CloudKeyId>;
  /** ログインで受け取ったキーを登録する */
  addPendingKey: (provider: CloudProviderId, save: SaveMode, label?: string) => Promise<CloudKeyId>;
  /** アプリの合言葉で、保存したすべてのキーを解除する。戻り値は解除できたキーの id */
  unlock: (passphrase: string) => Promise<CloudKeyId[]>;
  /** 生体認証で、保存したすべてのキーを解除する */
  unlockWithPasskey: () => Promise<CloudKeyId[]>;
  registerPasskey: (passphrase: string) => Promise<void>;
  removePasskey: () => void;
  /** 別の合言葉で保存した以前のキーを解除する（アプリの合言葉の形に移す） */
  unlockLegacy: (id: CloudKeyId, passphrase: string) => Promise<void>;
  /** 保存したすべてのキーをロックする */
  lock: () => void;
  changePassphrase: (current: string, next: string) => Promise<void>;
  rename: (id: CloudKeyId, label: string) => void;
  /** マイモデル（このキーで使うモデル）に入れる・外す */
  toggleMyModel: (id: CloudKeyId, model: string) => void;
  remove: (id: CloudKeyId) => void;
  /** すべてのキーとアプリの合言葉を消す（すべてのデータの削除・合言葉を忘れたとき） */
  removeAll: () => void;
  refreshModels: (id: CloudKeyId) => Promise<void>;
}

const keyInfos = (): KeyInfo[] =>
  listKeys().map((e) => ({
    ...e,
    stored: storedKeyInfo(e.id),
    legacy: isLegacyKey(e.id),
    unlocked: isUnlocked(e.id),
  }));

const snapshot = () => ({
  vault: vaultState(),
  passkey: hasPasskey(),
  keys: keyInfos(),
  pending: Object.fromEntries(
    CLOUD_PROVIDER_ID_LIST.map((p) => [p, hasPendingKey(p)]),
  ) as Record<CloudProviderId, boolean>,
});

export const useCloud = create<CloudState>()((set, get) => {
  const setCatalog = (id: CloudKeyId, models: CloudModel[]) => {
    const catalogs = { ...get().catalogs, [id]: { fetchedAt: Date.now(), models } };
    writeCatalogs(catalogs);
    set({ catalogs, modelsError: { ...get().modelsError, [id]: null } });
  };

  /** 解除したキーのモデルの一覧を、古ければ取り直す（1 日に 1 回くらい） */
  const refreshStale = (ids: CloudKeyId[]) => {
    for (const id of ids) {
      const c = get().catalogs[id];
      if (!c || Date.now() - c.fetchedAt > 86_400_000) void get().refreshModels(id);
    }
  };

  return {
    ...snapshot(),
    catalogs: readCatalogs(),
    modelsError: {},
    checking: null,

    async addKey(provider, apiKey, save, label) {
      set({ checking: `new:${provider}` });
      try {
        // 先にキーを確かめる（正しくないキーは保存しない）
        const models = await CLOUD_PROVIDERS[provider].listModels(apiKey.trim());
        if (save.mode === 'vault' && vaultState() !== 'open') {
          if (!save.passphrase) throw new Error('アプリの合言葉を入れてください');
          if (vaultState() === 'none') await createVault(save.passphrase);
          else await get().unlock(save.passphrase);
        }
        const id = await addKey(provider, apiKey, save.mode, { label });
        setCatalog(id, models);
        chooseModel(id, models);
        return id;
      } finally {
        set({ checking: null });
      }
    },

    async addPendingKey(provider, save, label) {
      const key = takePendingKey(provider);
      if (!key) throw new Error('受け取ったキーがありません。もう一度ログインしてください。');
      try {
        return await get().addKey(provider, key, save, label);
      } catch (e) {
        // 確かめられなかったときは、もう一度試せるよう戻しておく
        holdPendingKey(provider, key);
        throw e;
      }
    },

    async unlock(passphrase) {
      const opened = await openVault(passphrase);
      refreshStale(opened);
      return opened;
    },

    async unlockWithPasskey() {
      const opened = await unlockWithPasskey();
      refreshStale(opened);
      return opened;
    },

    registerPasskey: (passphrase) => registerPasskey(passphrase),
    removePasskey: () => removePasskey(),

    async unlockLegacy(id, passphrase) {
      await unlockLegacyKey(id, passphrase);
      refreshStale([id]);
    },

    lock() {
      lockVault();
    },

    changePassphrase: (current, next) => changePassphrase(current, next),

    rename(id, label) {
      updateKeyEntry(id, { label: label.trim() });
    },

    toggleMyModel(id, model) {
      const e = getKeyEntry(id);
      if (!e) return;
      updateKeyEntry(id, {
        models: e.models.includes(model) ? e.models.filter((m) => m !== model) : [...e.models, model],
      });
    },

    remove(id) {
      deleteKey(id);
      const catalogs = { ...get().catalogs };
      delete catalogs[id];
      writeCatalogs(catalogs);
      set({ catalogs });
      const s = useSettings.getState();
      const taskModels = Object.fromEntries(
        Object.entries(s.taskModels).filter(([, r]) => r?.provider !== id),
      );
      const cloudModels = { ...s.cloudModels };
      delete cloudModels[id];
      s.update({
        ...(s.aiProvider === id && { aiProvider: 'local' }),
        taskModels,
        cloudModels,
        recentCloudModels: s.recentCloudModels.filter((r) => !r.startsWith(`${id}|`)),
      });
    },

    removeAll() {
      for (const k of listKeys()) get().remove(k.id);
      deleteVault();
    },

    async refreshModels(id) {
      const key = getUnlockedKey(id);
      const entry = getKeyEntry(id);
      if (!key || !entry) return;
      set((st) => ({ checking: id, modelsError: { ...st.modelsError, [id]: null } }));
      try {
        const models = await CLOUD_PROVIDERS[entry.provider].listModels(key);
        setCatalog(id, models);
        chooseModel(id, models);
      } catch (e) {
        set((st) => ({ modelsError: { ...st.modelsError, [id]: errorMessage(e) } }));
      } finally {
        set({ checking: null });
      }
    },
  };
});

/** キーの表示名（名前がなければ会社の名前） */
export function keyLabel(k: Pick<KeyEntry, 'label' | 'provider'>): string {
  return k.label || CLOUD_PROVIDERS[k.provider].label;
}

/** 使うモデルを選ぶ */
export function selectCloudModel(id: CloudKeyId, model: string) {
  const { cloudModels, update } = useSettings.getState();
  update({ cloudModels: { ...cloudModels, [id]: model } });
}

/** 答えたモデルを「最近使ったモデル」の先頭に入れる */
export function rememberRecentModel(id: CloudKeyId, model: string) {
  const { recentCloudModels, update } = useSettings.getState();
  const entry = `${id}|${model}`;
  if (recentCloudModels[0] === entry) return;
  update({
    recentCloudModels: [entry, ...recentCloudModels.filter((r) => r !== entry)].slice(0, 6),
  });
}

/** 「最近使ったモデル」の 1 件を、キーとモデルに分ける（キーを消していたら null） */
export function parseRecent(entry: string): { id: CloudKeyId; model: string } | null {
  const i = entry.indexOf('|');
  if (i < 0) return null;
  const id = entry.slice(0, i);
  if (!getKeyEntry(id)) return null;
  return { id, model: entry.slice(i + 1) };
}

/** 選んでいるモデルが無い（または使えなくなった）ときは既定のモデルにする */
function chooseModel(id: CloudKeyId, models: CloudModel[]) {
  const entry = getKeyEntry(id);
  if (!entry) return;
  const { cloudModels, update } = useSettings.getState();
  const current = cloudModels[id];
  if (current && (models.some((m) => m.id === current) || entry.models.includes(current))) return;
  const next = CLOUD_PROVIDERS[entry.provider].pickDefaultModel(models);
  if (next) update({ cloudModels: { ...cloudModels, [id]: next } });
}

subscribeVault(() => useCloud.setState(snapshot()));

/** 以前の「OpenRouter の ★」を、OpenRouter のキーのマイモデルに移す */
{
  const favs = useSettings.getState().openrouterFavorites;
  const target = listKeys().find((k) => k.provider === 'openrouter' && !k.session);
  if (favs.length && target) {
    updateKeyEntry(target.id, { models: [...new Set([...target.models, ...favs])] });
    useSettings.getState().update({ openrouterFavorites: [] });
  }
}
