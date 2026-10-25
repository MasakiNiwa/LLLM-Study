/**
 * クラウド AI の接続の状態（接続先ごと）。キーそのものは持たない（lib/cloud/keyVault.ts のメモリーにだけある）。
 */
import { create } from 'zustand';
import {
  deleteKey,
  getUnlockedKey,
  isUnlocked,
  lockKey,
  saveKey,
  storedKeyInfo,
  subscribeVault,
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
  models: PerProvider<CloudModel[]>;
  modelsError: PerProvider<string | null>;
  checking: CloudProviderId | null;

  /** キーを確かめて（モデルの一覧を取って）から登録する。passphrase が null なら今回だけ */
  register: (provider: CloudProviderId, apiKey: string, passphrase: string | null) => Promise<void>;
  unlock: (provider: CloudProviderId, passphrase: string) => Promise<void>;
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

  async unlock(provider, passphrase) {
    await unlockKey(provider, passphrase);
    void get().refreshModels(provider);
  },

  lock(provider) {
    lockKey(provider);
  },

  remove(provider) {
    deleteKey(provider);
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

/** 選んでいるモデルが無い（または使えなくなった）ときは既定のモデルにする */
function chooseModel(provider: CloudProviderId, models: CloudModel[]) {
  const { cloudModels, update } = useSettings.getState();
  const current = cloudModels[provider];
  if (current && models.some((m) => m.id === current)) return;
  const next = CLOUD_PROVIDERS[provider].pickDefaultModel(models);
  if (next) update({ cloudModels: { ...cloudModels, [provider]: next } });
}

subscribeVault(() => useCloud.setState(snapshot()));
