/**
 * クラウド AI の接続の状態（接続先ごと）。キーそのものは持たない（lib/cloud/keyVault.ts のメモリーにだけある）。
 */
import { create } from 'zustand';
import {
  changePassphrase,
  createVault,
  deleteKey,
  deleteVault,
  getUnlockedKey,
  hasPendingKey,
  holdPendingKey,
  isLegacyKey,
  isUnlocked,
  lockVault,
  openVault,
  saveKey,
  storedKeyInfo,
  subscribeVault,
  takePendingKey,
  unlockLegacyKey,
  vaultState,
  type CloudProviderId,
} from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS, CLOUD_PROVIDER_IDS, type CloudModel } from '@/lib/cloud/providers';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';

type PerProvider<T> = Record<CloudProviderId, T>;

/**
 * 保存のしかた。vault: アプリの合言葉で暗号化して保存（解除中でなければ passphrase で解除する。
 * まだ合言葉がなければ passphrase を合言葉にする）、session: 今回だけ
 */
export type SaveMode = { mode: 'vault'; passphrase?: string } | { mode: 'session' };

interface CloudState {
  /** アプリの合言葉の状態（none: まだ決めていない、locked: ロック中、open: 解除中） */
  vault: 'none' | 'locked' | 'open';
  /** 暗号化して保存したキー（末尾 4 文字と保存日時） */
  stored: PerProvider<{ hint: string; savedAt: number } | null>;
  /** 以前の形（キーごとの別の合言葉）で保存したキー */
  legacy: PerProvider<boolean>;
  /** 解除済み（このタブで使える） */
  unlocked: PerProvider<boolean>;
  /** ログインで受け取った、まだ保存していないキーがある */
  pending: PerProvider<boolean>;
  models: PerProvider<CloudModel[]>;
  modelsError: PerProvider<string | null>;
  checking: CloudProviderId | null;

  /** キーを確かめて（モデルの一覧を取って）から登録する */
  register: (provider: CloudProviderId, apiKey: string, save: SaveMode) => Promise<void>;
  /** ログインで受け取ったキーを登録する */
  registerPending: (provider: CloudProviderId, save: SaveMode) => Promise<void>;
  /** アプリの合言葉で、保存したすべてのキーを解除する。戻り値は解除できた接続先 */
  unlock: (passphrase: string) => Promise<CloudProviderId[]>;
  /** 別の合言葉で保存した以前のキーを解除する（アプリの合言葉の形に移す） */
  unlockLegacy: (provider: CloudProviderId, passphrase: string) => Promise<void>;
  /** 保存したすべてのキーをロックする */
  lock: () => void;
  changePassphrase: (passphrase: string) => Promise<void>;
  remove: (provider: CloudProviderId) => void;
  /** すべての接続先のキーとアプリの合言葉を消す（すべてのデータの削除・合言葉を忘れたとき） */
  removeAll: () => void;
  refreshModels: (provider: CloudProviderId) => Promise<void>;
}

const each = <T>(f: (p: CloudProviderId) => T) =>
  Object.fromEntries(CLOUD_PROVIDER_IDS.map((p) => [p, f(p)])) as PerProvider<T>;

const snapshot = () => ({
  vault: vaultState(),
  stored: each((p) => storedKeyInfo(p)),
  legacy: each((p) => isLegacyKey(p)),
  unlocked: each((p) => isUnlocked(p)),
  pending: each((p) => hasPendingKey(p)),
});

export const useCloud = create<CloudState>()((set, get) => ({
  ...snapshot(),
  models: each(() => [] as CloudModel[]),
  modelsError: each(() => null as string | null),
  checking: null,

  async register(provider, apiKey, save) {
    set({ checking: provider });
    try {
      // 先にキーを確かめる（正しくないキーは保存しない）
      const models = await CLOUD_PROVIDERS[provider].listModels(apiKey.trim());
      if (save.mode === 'vault' && vaultState() !== 'open') {
        if (!save.passphrase) throw new Error('アプリの合言葉を入れてください');
        if (vaultState() === 'none') await createVault(save.passphrase);
        else await get().unlock(save.passphrase);
      }
      await saveKey(provider, apiKey, save.mode);
      set((st) => ({
        models: { ...st.models, [provider]: models },
        modelsError: { ...st.modelsError, [provider]: null },
      }));
      chooseModel(provider, models);
    } finally {
      set({ checking: null });
    }
  },

  async registerPending(provider, save) {
    const key = takePendingKey(provider);
    if (!key) throw new Error('受け取ったキーがありません。もう一度ログインしてください。');
    try {
      await get().register(provider, key, save);
    } catch (e) {
      // 確かめられなかったときは、もう一度試せるよう戻しておく
      holdPendingKey(provider, key);
      throw e;
    }
  },

  async unlock(passphrase) {
    const opened = await openVault(passphrase);
    for (const p of opened) void get().refreshModels(p);
    return opened;
  },

  async unlockLegacy(provider, passphrase) {
    await unlockLegacyKey(provider, passphrase);
    void get().refreshModels(provider);
  },

  lock() {
    lockVault();
  },

  async changePassphrase(passphrase) {
    await changePassphrase(passphrase);
  },

  remove(provider) {
    deleteKey(provider);
    set((st) => ({ models: { ...st.models, [provider]: [] } }));
    if (useSettings.getState().aiProvider === provider)
      useSettings.getState().update({ aiProvider: 'local' });
  },

  removeAll() {
    for (const p of CLOUD_PROVIDER_IDS) get().remove(p);
    deleteVault();
  },

  async refreshModels(provider) {
    const key = getUnlockedKey(provider);
    if (!key) return;
    set((st) => ({ checking: provider, modelsError: { ...st.modelsError, [provider]: null } }));
    try {
      const models = await CLOUD_PROVIDERS[provider].listModels(key);
      set((st) => ({ models: { ...st.models, [provider]: models } }));
      chooseModel(provider, models);
    } catch (e) {
      set((st) => ({ modelsError: { ...st.modelsError, [provider]: errorMessage(e) } }));
    } finally {
      set({ checking: null });
    }
  },
}));

/** 使うモデルを選ぶ */
export function selectCloudModel(provider: CloudProviderId, model: string) {
  const { cloudModels, update } = useSettings.getState();
  update({ cloudModels: { ...cloudModels, [provider]: model } });
}

/** 答えたモデルを「最近使ったモデル」の先頭に入れる */
export function rememberRecentModel(provider: CloudProviderId, model: string) {
  const { recentCloudModels, update } = useSettings.getState();
  const entry = `${provider}|${model}`;
  if (recentCloudModels[0] === entry) return;
  update({
    recentCloudModels: [entry, ...recentCloudModels.filter((r) => r !== entry)].slice(0, 6),
  });
}

/** 「最近使ったモデル」の 1 件を、接続先とモデルに分ける */
export function parseRecent(entry: string): { provider: CloudProviderId; model: string } | null {
  const i = entry.indexOf('|');
  if (i < 0) return null;
  const provider = entry.slice(0, i) as CloudProviderId;
  if (!CLOUD_PROVIDER_IDS.includes(provider)) return null;
  return { provider, model: entry.slice(i + 1) };
}

/** 選んでいるモデルが無い（または使えなくなった）ときは既定のモデルにする */
function chooseModel(provider: CloudProviderId, models: CloudModel[]) {
  const { cloudModels, update } = useSettings.getState();
  const current = cloudModels[provider];
  if (current && models.some((m) => m.id === current)) return;
  const next = CLOUD_PROVIDERS[provider].pickDefaultModel(models);
  if (next) update({ cloudModels: { ...cloudModels, [provider]: next } });
}

subscribeVault(() => useCloud.setState(snapshot()));
