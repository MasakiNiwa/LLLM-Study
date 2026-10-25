/**
 * メインスレッド ⇔ Engine Worker 間で受け渡す型。
 * LiteRT-LM 固有の型はできるだけ Worker 内に閉じ込め、UI 側はこの型だけを見る。
 * 将来別のランタイム（WebLLM / Transformers.js など）を追加する場合もこの境界を保つ。
 */

/** 推論バックエンド */
export type BackendKind = 'gpu-artisan' | 'gpu' | 'cpu';

export type ModelSource =
  { kind: 'file'; file: File; save: boolean } | { kind: 'stored'; name: string };

export interface LoadModelRequest {
  source: ModelSource;
  backend: BackendKind;
  maxNumTokens: number;
}

export type LoadPhase = 'runtime' | 'reading' | 'initializing';

export interface LoadProgress {
  phase: LoadPhase;
  loadedBytes: number;
  totalBytes: number;
  /** OPFS への保存を並行している場合の進捗 */
  saveLoadedBytes?: number;
}

export interface LoadedModelInfo {
  name: string;
  sizeBytes: number;
  backend: BackendKind;
  maxNumTokens: number;
  loadTimeMs: number;
  /** 保存に失敗した場合のメッセージ（読み込み自体は成功） */
  saveError?: string;
  saved: boolean;
}

/** 会話（Conversation）単位の設定。変わると Worker 側で会話を作り直す */
export interface ConversationSettings {
  systemPrompt: string;
  temperature: number;
  topK: number;
  topP: number;
  maxOutputTokens: number;
  enableThinking: boolean;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/** モデルに渡すツール（関数）の宣言。JSON Schema のサブセット */
export interface ToolSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, ToolSchema>;
  required?: string[];
  items?: ToolSchema;
  enum?: string[];
}

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters?: ToolSchema;
}

/** LiteRT-LM の JsonValue と同じ形（値が undefined のキーは無視される） */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue | undefined };

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, JsonValue>;
}

export interface GenerateRequest {
  settings: ConversationSettings;
  /** 新しいユーザー発話より前の履歴 */
  history: ChatTurn[];
  message: ChatTurn;
  assistantId: string;
  /**
   * chat: 会話（KV キャッシュ）を引き継ぐ通常のチャット
   * oneshot: 履歴を持たない単発の生成（カードの解説など）。終わったら会話を破棄する
   */
  mode?: 'chat' | 'oneshot';
  /**
   * oneshot のとき、チャットの会話（KV キャッシュ）を残したまま別の会話で生成する。
   * 作れない環境では、これまでどおりチャットの会話を捨ててから生成する
   */
  keepChat?: boolean;
  /** モデルに使わせるツール。実行はメインスレッド（onToolCall）で行う */
  tools?: ToolDeclaration[];
}

export type GenerateEvent =
  | { type: 'prefill-start' }
  | { type: 'first-token' }
  | { type: 'delta'; text: string; channel?: string }
  | { type: 'tool-call'; call: ToolCallInfo }
  | { type: 'tool-result'; name: string; ok: boolean };

export interface GenerationStats {
  /** 生成に使ったバックエンド */
  backend?: BackendKind;
  /** クラウド AI で生成したとき、その名前（例: Gemini（gemini-2.5-flash）） */
  provider?: string;
  totalMs: number;
  ttftMs?: number;
  prefillTokens?: number;
  prefillTokensPerSec?: number;
  decodeTokens?: number;
  decodeTokensPerSec?: number;
  contextTokens?: number;
}

export interface GenerateResult {
  status: 'done' | 'cancelled';
  stats: GenerationStats;
}

export interface StoredModel {
  name: string;
  sizeBytes: number;
  lastModified: number;
  /** 保存したアプリ名（共通モデル保存領域のメタデータ。無い場合は不明） */
  savedBy?: string;
  /** 入手元 URL（ダウンロードした場合） */
  source?: string;
}

export interface DownloadProgress {
  name: string;
  loadedBytes: number;
  /** Content-Length が無い場合は 0 */
  totalBytes: number;
  bytesPerSec: number;
}
