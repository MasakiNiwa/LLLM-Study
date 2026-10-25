/**
 * クラウド AI（Gemini API）の接続の状態。キーそのものは持たない（lib/cloud/keyVault.ts のメモリーにだけある）。
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
} from '@/lib/cloud/keyVault';
import { listGeminiModels, pickDefaultGeminiModel, type GeminiModel } from '@/lib/cloud/gemini';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';

interface CloudState {
  /** 暗号化して保存したキー（末尾 4 文字と保存日時） */
  stored: { hint: string; savedAt: number } | null;
  /** 解除済み（このタブで使える） */
  unlocked: boolean;
  models: GeminiModel[];
  modelsError: string | null;
  checking: boolean;

  /** キーを確かめて（モデルの一覧を取って）から登録する。passphrase が null なら今回だけ */
  register: (apiKey: string, passphrase: string | null) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  remove: () => void;
  /** モデルの一覧を取り直す（解除済みのとき） */
  refreshModels: () => Promise<void>;
}

const snapshot = () => ({ stored: storedKeyInfo('gemini'), unlocked: isUnlocked('gemini') });

export const useCloud = create<CloudState>()((set, get) => ({
  ...snapshot(),
  models: [],
  modelsError: null,
  checking: false,

  async register(apiKey, passphrase) {
    set({ checking: true, modelsError: null });
    try {
      // 先にキーを確かめる（正しくないキーは保存しない）
      const models = await listGeminiModels(apiKey.trim());
      await saveKey('gemini', apiKey, passphrase);
      set({ models });
      chooseModel(models);
    } finally {
      set({ checking: false });
    }
  },

  async unlock(passphrase) {
    await unlockKey('gemini', passphrase);
    void get().refreshModels();
  },

  lock() {
    lockKey('gemini');
  },

  remove() {
    deleteKey('gemini');
    set({ models: [], modelsError: null });
    if (useSettings.getState().aiProvider === 'gemini')
      useSettings.getState().update({ aiProvider: 'local' });
  },

  async refreshModels() {
    const key = getUnlockedKey('gemini');
    if (!key) return;
    set({ checking: true, modelsError: null });
    try {
      const models = await listGeminiModels(key);
      set({ models });
      chooseModel(models);
    } catch (e) {
      set({ modelsError: errorMessage(e) });
    } finally {
      set({ checking: false });
    }
  },
}));

/** 選んでいるモデルが無い（または使えなくなった）ときは既定のモデルにする */
function chooseModel(models: GeminiModel[]) {
  const { geminiModel, update } = useSettings.getState();
  if (geminiModel && models.some((m) => m.id === geminiModel)) return;
  const next = pickDefaultGeminiModel(models);
  if (next) update({ geminiModel: next });
}

subscribeVault(() => useCloud.setState(snapshot()));
