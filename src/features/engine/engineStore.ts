import { toast } from 'sonner';
import { create } from 'zustand';
import { llm } from '@/lib/llm/client';
import { listStoredModels } from '@/lib/llm/modelStorage';
import { detectCapabilities } from '@/lib/env/capabilities';
import type {
  BackendKind,
  DownloadProgress,
  LoadProgress,
  LoadedModelInfo,
  ModelSource,
  StoredModel,
} from '@/lib/llm/types';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';
import { resolveBackend } from './backend';
import { findCatalogModel, isEmbeddingModelName, isGpuOnlyModel } from '@/lib/llm/modelCatalog';
import { classifyLoadError, explainLoadError } from './loadErrors';
import { isAiBusy } from '@/features/ai/aiBusy';

/**
 * AI が応答を生成している間は、モデルの読み込み・切り替え・解放をしない
 * （生成中のモデルを入れ替えると、応答が途中で失敗したり状態が食い違ったりするため）。
 */
function blockedByGeneration(): boolean {
  if (!isAiBusy()) return false;
  toast.error('AI が応答を生成中です', {
    description: '生成が終わるか、止めてからもう一度お試しください',
  });
  return true;
}

export { resolveBackend } from './backend';

export type EngineStatus = 'empty' | 'loading' | 'ready' | 'error';

interface EngineState {
  status: EngineStatus;
  progress: LoadProgress | null;
  /** 読み込み中のモデル名 */
  loadingName: string | null;
  model: LoadedModelInfo | null;
  error: string | null;
  storedModels: StoredModel[];
  /** ダウンロード中の進捗（null: ダウンロードしていない） */
  download: DownloadProgress | null;
  /** WebGPU が使えるか（null: 未判定） */
  webgpu: boolean | null;
  /** 自動フォールバックで失敗した試行（バックエンドと理由）。使用中モデルの補足として表示する */
  fallbackLog: { backend: BackendKind; message: string }[];

  refreshStoredModels: () => Promise<void>;
  detectWebGpu: () => Promise<boolean>;
  /** backend を指定すると設定より優先する */
  load: (source: ModelSource, backend?: BackendKind, isFallback?: boolean) => Promise<boolean>;
  unload: () => Promise<void>;
  downloadModel: (url: string) => Promise<void>;
  cancelDownload: () => void;
}

export const useEngine = create<EngineState>()((set, get) => ({
  status: 'empty',
  progress: null,
  loadingName: null,
  model: null,
  error: null,
  storedModels: [],
  download: null,
  webgpu: null,
  fallbackLog: [],

  async detectWebGpu() {
    const { webgpu } = await detectCapabilities();
    set({ webgpu });
    return webgpu;
  },

  async refreshStoredModels() {
    try {
      // 共通保存領域には他のサイトが保存した埋め込みモデルなどもあるので、チャット用だけ表示する
      set({
        storedModels: (await listStoredModels()).filter((m) => !isEmbeddingModelName(m.name)),
      });
    } catch (e) {
      console.warn('OPFS の一覧取得に失敗しました', e);
    }
  },

  async load(source, backendOverride, isFallback = false) {
    if (get().status === 'loading') return false;
    if (!isFallback && blockedByGeneration()) return false;
    const settings = useSettings.getState();
    const name = source.kind === 'file' ? source.file.name : source.name;
    const webgpu = get().webgpu ?? (await get().detectWebGpu());
    // 自動設定なら、前回フォールバックで読み込めたバックエンドを優先する
    const hint = settings.backend === 'auto' ? settings.backendHints[name] : undefined;
    const backend =
      backendOverride ??
      (hint && !(hint !== 'cpu' && webgpu === false)
        ? hint
        : resolveBackend(settings.backend, webgpu));
    const gpuOnly = isGpuOnlyModel(name);

    // ストリーミング読み込みに非対応と分かっているモデルは、必ず失敗する GPU Artisan を飛ばす
    if (
      backend === 'gpu-artisan' &&
      !backendOverride &&
      findCatalogModel(name)?.streamingLoad === false
    ) {
      set({ fallbackLog: [] });
      return get().load(source, 'gpu', true);
    }

    // WebGPU 専用モデルを CPU で読み込んでも必ず失敗するので、読み込む前に止める
    if (gpuOnly && backend === 'cpu') {
      const hint = explainLoadError('gpu-only', name) ?? '';
      set({ status: 'error', error: hint, progress: null, loadingName: null, model: null });
      toast.error('このモデルは CPU では動きません', { description: hint, duration: 15000 });
      return false;
    }
    set({
      status: 'loading',
      loadingName: name,
      error: null,
      progress: null,
      model: null,
      // 自動フォールバックの連鎖中は失敗の記録を引き継ぐ
      fallbackLog: isFallback ? get().fallbackLog : [],
    });
    // 進捗通知は高頻度で届くので 1 フレームに 1 回だけ反映する
    let pending: LoadProgress | null = null;
    let raf = 0;
    try {
      const info = await llm.loadModel(
        { source, backend, maxNumTokens: settings.maxNumTokens },
        (p) => {
          pending = p;
          if (!raf) {
            raf = requestAnimationFrame(() => {
              raf = 0;
              set({ progress: pending });
            });
          }
        },
      );
      cancelAnimationFrame(raf);
      set({ status: 'ready', model: info, progress: null, loadingName: null });
      settings.update({
        lastModelName: info.saved || source.kind === 'stored' ? info.name : null,
        ...(isFallback ? { backendHints: { ...settings.backendHints, [info.name]: backend } } : {}),
      });
      if (info.saveError) {
        toast.warning('モデルのブラウザ保存に失敗しました', { description: info.saveError });
      }
      if (info.saved) void get().refreshStoredModels();
      toast.success(`${info.name} を読み込みました`, {
        description:
          backend === 'cpu'
            ? get().fallbackLog.length > 0
              ? 'GPU では読み込めなかったため CPU で実行します（理由はモデル画面に表示）'
              : 'CPU で実行します（GPU より遅くなります）'
            : undefined,
      });
      return true;
    } catch (e) {
      cancelAnimationFrame(raf);
      const message = errorMessage(e);
      console.error(e);
      const kind = classifyLoadError(message);
      const hint = explainLoadError(kind, name);
      set({
        status: 'error',
        error: hint ? `${message}\n${hint}` : message,
        progress: null,
        loadingName: null,
      });
      // Wasm / GPU が壊れた状態の可能性があるので Worker を作り直す（ダウンロード中は除く）
      if (!get().download) llm.terminate();

      const recordFallback = () =>
        set((st) => ({ fallbackLog: [...st.fallbackLog, { backend, message }] }));

      // GPU Artisan のストリーミング読み込みが非対応の形式なら、通常の GPU 読み込みで自動的に再試行する
      if (kind === 'streaming-unsupported' && backend === 'gpu-artisan') {
        toast.info(
          'ストリーミング読み込みに非対応の形式のため、通常の GPU 読み込みで再試行します',
          {
            description: 'モデル全体をメモリに読み込むため、時間とメモリが多めに必要です',
          },
        );
        recordFallback();
        return get().load(source, 'gpu', true);
      }
      // 通常の GPU 読み込みでも失敗したら、CPU で自動的に再試行する（メモリ不足は CPU でも同じなので除く）
      if (isFallback && backend === 'gpu' && !gpuOnly && kind !== 'memory') {
        toast.info('GPU で読み込めなかったため、CPU で再試行します');
        recordFallback();
        return get().load(source, 'cpu', true);
      }

      // GPU が原因なら CPU での再試行を提案する（取り込んだファイルはそのまま再利用できる）
      const offerCpu =
        backend !== 'cpu' && !gpuOnly && (kind === 'webgpu' || kind === 'streaming-unsupported');
      toast.error('モデルの読み込みに失敗しました', {
        description: hint ? `${message}\n${hint}` : message,
        duration: offerCpu ? 15000 : undefined,
        action: offerCpu
          ? { label: 'CPU で再試行', onClick: () => void get().load(source, 'cpu') }
          : undefined,
      });
      return false;
    }
  },
  async unload() {
    if (blockedByGeneration()) return;
    await llm.unloadModel().catch(() => llm.terminate());
    set({ status: 'empty', model: null, progress: null, error: null });
  },

  async downloadModel(url) {
    if (get().download) return;
    set({ download: { name: '', loadedBytes: 0, totalBytes: 0, bytesPerSec: 0 } });
    let pending: DownloadProgress | null = null;
    let raf = 0;
    try {
      const name = await llm.downloadModel(url, (p) => {
        pending = p;
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (get().download) set({ download: pending });
          });
        }
      });
      cancelAnimationFrame(raf);
      set({ download: null });
      await get().refreshStoredModels();
      toast.success(`${name} をダウンロードしました`);
      // そのまま読み込む
      if (get().status !== 'loading') void get().load({ kind: 'stored', name });
    } catch (e) {
      cancelAnimationFrame(raf);
      set({ download: null });
      const message = errorMessage(e);
      // Comlink 越しだとエラー名が失われることがあるのでメッセージでも判定する
      if ((e instanceof Error && e.name === 'AbortError') || /abort/i.test(message)) {
        toast.info('ダウンロードを中止しました');
      } else {
        console.error(e);
        toast.error('ダウンロードに失敗しました', { description: message });
      }
    }
  },

  cancelDownload() {
    llm.cancelDownload();
  },
}));
