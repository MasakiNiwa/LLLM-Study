/**
 * ブラウザ（LiteRT-LM Web 版）で動作が確認されているモデルの一覧。
 *
 * - 公式: @litert-lm/core の README で Web 対応が明記されているもの
 * - コミュニティ: 公式サポート外だが、@localmode/litert などで動作が報告されているもの
 *
 * モデルファイル自体は本アプリに含まれない（ユーザーが Hugging Face から取得する）。
 * 一覧と入手先は Try Local（https://github.com/MasakiNiwa/Try-Local）と揃えている。
 * 本アプリはチャット用モデルのみ使う（共通保存領域にある埋め込みモデルは一覧に出さない）。
 */
export type ModelKind = 'chat' | 'embedding';

export interface CatalogModel {
  /** chat: 文章生成（チャット）、embedding: 埋め込み（画像・テキストのベクトル化） */
  kind: ModelKind;
  file: string;
  repo: string;
  title: string;
  note: string;
  /** 目安のファイルサイズ */
  sizeLabel: string;
  license: string;
  /** true: WebGPU 専用（GPU 向けにコンパイル済みで CPU では動かない） */
  gpuOnly: boolean;
  /** true: @litert-lm/core が公式にサポート */
  official: boolean;
  /** false: GPU Artisan のストリーミング読み込みに非対応（最初から通常の GPU 読み込みを試す） */
  streamingLoad: boolean;
  /** false: ダウンロードの一覧には出さない（他のサイトで保存済みなら名前の表示には使う） */
  recommended: boolean;
}

/**
 * 表示順 = おすすめ順。公式 Web 版を優先する。
 * Qwen3 0.6B は速度・回答の質ともに学習の相手としては実用に届かないため、ダウンロードの一覧からは外している
 * （同じ github.io の他のサイトで保存済みなら読み込める）。
 */
export const MODEL_CATALOG: CatalogModel[] = [
  {
    kind: 'chat',
    file: 'gemma-4-E2B-it-web.litertlm',
    repo: 'litert-community/gemma-4-E2B-it-litert-lm',
    title: 'Gemma 4 E2B',
    note: 'おすすめ。公式の Web 版で、GPU で実用的な速度と品質',
    sizeLabel: '約 2.0 GB',
    license: 'Gemma',
    gpuOnly: true,
    official: true,
    streamingLoad: true,
    recommended: true,
  },
  {
    kind: 'chat',
    file: 'gemma-4-E4B-it-web.litertlm',
    repo: 'litert-community/gemma-4-E4B-it-litert-lm',
    title: 'Gemma 4 E4B',
    note: '公式の Web 版。より高品質だがメモリを多く使う',
    sizeLabel: '約 3.0 GB',
    license: 'Gemma',
    gpuOnly: true,
    official: true,
    streamingLoad: true,
    recommended: true,
  },
  {
    kind: 'chat',
    file: 'Qwen3-0.6B.litertlm',
    repo: 'litert-community/Qwen3-0.6B',
    title: 'Qwen3 0.6B',
    note: 'WebGPU が使えない端末向けの代替。CPU で動くが遅く、回答の質も控えめ',
    sizeLabel: '約 614 MB',
    license: 'Apache-2.0',
    gpuOnly: false,
    official: false,
    streamingLoad: false,
    recommended: false,
  },
];

export function huggingFacePageUrl(m: CatalogModel): string {
  return `https://huggingface.co/${m.repo}/tree/main`;
}

/** 直接ダウンロード用の URL */
export function downloadUrl(m: CatalogModel): string {
  return `https://huggingface.co/${m.repo}/resolve/main/${m.file}`;
}

/** ブラウザが重複ダウンロード時に付ける「 (1)」などを取り除く */
function normalizeName(fileName: string): string {
  return fileName.replace(/\s*\(\d+\)(?=\.litertlm$)/i, '').toLowerCase();
}

export function findCatalogModel(fileName: string): CatalogModel | undefined {
  const lower = normalizeName(fileName);
  return MODEL_CATALOG.find((m) => m.file.toLowerCase() === lower);
}

/** ブラウザで動く見込みのあるモデルか（Web 版、または動作確認済みの一覧にある） */
export function isBrowserCompatibleName(fileName: string): boolean {
  return (
    /-web\.litertlm$/.test(normalizeName(fileName)) || findCatalogModel(fileName) !== undefined
  );
}

/** WebGPU 専用のモデルか（Gemma 4 の Web 版は GPU 向けにコンパイルされている） */
export function isGpuOnlyModel(fileName: string): boolean {
  return (
    findCatalogModel(fileName)?.gpuOnly ??
    /^gemma-4-.*-web\.litertlm$/.test(normalizeName(fileName))
  );
}

/** 埋め込みモデルか（カタログにある、またはファイル名に embedding を含む） */
export function isEmbeddingModelName(fileName: string): boolean {
  const m = findCatalogModel(fileName);
  return m ? m.kind === 'embedding' : /embedding/i.test(fileName);
}
