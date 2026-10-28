/**
 * クラウド AI の接続の状態（接続先ごと）。キーそのものは持たない（lib/cloud/keyVault.ts のメモリーにだけある）。
 */
import { create } from 'zustand';
import {
  deleteKey,
  getUnlockedKey,
  hasPendingKey,
  holdPendingKey,
  isUnlocked,
  lockKey,
  saveKey,
  storedKeyInfo,
  subscribeVault,
  takePendingKey,
  unlockKey,
  type CloudProviderId,
} from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS, CLOUD_PROVIDER_IDS, type CloudModel } from '@/lib/cloud/providers';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';

type PerProvider<T> = Record<CloudProviderId, T>;

interface CloudState {
  /** 暗号化して保存したキー（末尾 4 文字と保存日時） */
  stored: PerProvider<{ hint: string; savedAt: number } | null>;
  /** 解除済み（このタブで使える） */
  unlocked: PerProvider<boolean>;
  /** ログインで受け取った、まだ保存していないキーがある */
  pending: PerProvider<boolean>;
  models: PerProvider<CloudModel[]>;
  modelsError: PerProvider<string | null>;
  checking: CloudProviderId | null;

  /** キーを確かめて（モデルの一覧を取って）から登録する。passphrase が null なら今回だけ */
  register: (provider: CloudProviderId, apiKey: string, passphrase: string | null) => Promise<void>;
  /** ログインで受け取ったキーを登録する */
  registerPending: (provider: CloudProviderId, passphrase: string | null) => Promise<void>;
  /**
   * 合言葉でキーを解除する。同じ合言葉で保存したほかの接続先のキーも、まとめて解除する。
   * 戻り値は、まとめて解除できたほかの接続先
   */
  unlock: (provider: CloudProviderId, passphrase: string) => Promise<CloudProviderId[]>;
  lock: (provider: CloudProviderId) => void;
  remove: (provider: CloudProviderId) => void;
  /** すべての接続先のキーを消す（すべてのデータの削除） */
  removeAll: () => void;
  refreshModels: (provider: CloudProviderId) => Promise<void>;
}

const each = <T>(f: (p: CloudProviderId) => T) =>
  Object.fromEntries(CLOUD_PROVIDER_IDS.map((p) => [p, f(p)])) as PerProvider<T>;

const snapshot = () => ({
  stored: each((p) => storedKeyInfo(p)),
  unlocked: each((p) => isUnlocked(p)),
  pending: each((p) => hasPendingKey(p)),
});

export const useCloud = create<CloudState>()((set, get) => ({
  ...snapshot(),
  models: each(() => [] as CloudModel[]),
  modelsError: each(() => null as string | null),
  checking: null,

  async register(provider, apiKey, passphrase) {
    set({ checking: provider });
    try {
      // 先にキーを確かめる（正しくないキーは保存しない）
      const models = await CLOUD_PROVIDERS[provider].listModels(apiKey.trim());
      await saveKey(provider, apiKey, passphrase);
      set((st) => ({
        models: { ...st.models, [provider]: models },
        modelsError: { ...st.modelsError, [provider]: null },
      }));
      chooseModel(provider, models);
    } finally {
      set({ checking: null });
    }
  },

  async registerPending(provider, passphrase) {
    const key = takePendingKey(provider);
    if (!key) throw new Error('受け取ったキーがありません。もう一度ログインしてください。');
    try {
      await get().register(provider, key, passphrase);
    } catch (e) {
      // 確かめられなかったときは、もう一度試せるよう戻しておく
      holdPendingKey(provider, key);
      throw e;
    }
  },

  async unlock(provider, passphrase) {
    await unlockKey(provider, passphrase);
    void get().refreshModels(provider);
    const also: CloudProviderId[] = [];
    for (const p of CLOUD_PROVIDER_IDS) {
      if (p === provider || isUnlocked(p) || !storedKeyInfo(p)) continue;
      try {
        await unlockKey(p, passphrase);
        also.push(p);
        void get().refreshModels(p);
      } catch {
        // 別の合言葉で保存したキー。そのままロックしておく
      }
    }
    return also;
  },

  lock(provider) {
    lockKey(provider);
  },

  remove(provider) {
    deleteKey(provider);
    takePendingKey(provider);
    set((st) => ({ models: { ...st.models, [provider]: [] } }));
    if (useSettings.getState().aiProvider === provider)
      useSettings.getState().update({ aiProvider: 'local' });
  },

  removeAll() {
    for (const p of CLOUD_PROVIDER_IDS) get().remove(p);
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
