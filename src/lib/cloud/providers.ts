/**
 * クラウド AI の接続先の一覧。新しい接続先はここに足す（UI の説明は features/cloud/providerInfo.tsx、
 * 送信先は build/vite-plugin-csp.ts の CONNECT_SOURCES にも足す）。
 */
import type {
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
} from '@/lib/llm/types';
import { anthropicGenerate, listAnthropicModels, pickDefaultAnthropicModel } from './anthropic';
import { geminiGenerate, listGeminiModels, pickDefaultGeminiModel } from './gemini';
import type { CloudProviderId } from './keyVault';
import { listOpenAiModels, openaiGenerate, pickDefaultOpenAiModel } from './openai';
import {
  listOpenRouterModels,
  openrouterGenerate,
  pickDefaultOpenRouterModel,
  shortOpenRouterModel,
  type OpenRouterModel,
} from './openrouter';

/** モデル。OpenRouter のモデルは料金・ツール対応などの情報も持つ */
export type CloudModel = { id: string; displayName: string } & Partial<
  Omit<OpenRouterModel, 'id' | 'displayName'>
>;

export interface CloudGenerateOptions {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export interface CloudProvider {
  id: CloudProviderId;
  /** 画面に出す名前 */
  label: string;
  /** 生成に使えるモデルの一覧（キーの確認にも使う） */
  listModels: (apiKey: string, signal?: AbortSignal) => Promise<CloudModel[]>;
  // 接続先ごとのモデルの型（情報の多い OpenRouter など）を受け取れるよう、引数は双変にしておく
  pickDefaultModel(models: CloudModel[]): string | null;
  generate: (
    req: GenerateRequest,
    opts: CloudGenerateOptions,
    onEvent: (e: GenerateEvent) => void,
    onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
  ) => Promise<GenerateResult>;
  /** チップなどに出す短いモデル名 */
  shortModel: (model: string) => string;
}

export const CLOUD_PROVIDERS: Record<CloudProviderId, CloudProvider> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    listModels: listGeminiModels,
    pickDefaultModel: pickDefaultGeminiModel,
    generate: geminiGenerate,
    shortModel: (m) => m.replace(/^gemini-/, ''),
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    listModels: listOpenAiModels,
    pickDefaultModel: pickDefaultOpenAiModel,
    generate: openaiGenerate,
    shortModel: (m) => m,
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude',
    listModels: listAnthropicModels,
    pickDefaultModel: pickDefaultAnthropicModel,
    generate: anthropicGenerate,
    shortModel: (m) => m.replace(/^claude-/, ''),
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    listModels: listOpenRouterModels,
    pickDefaultModel: (models) => pickDefaultOpenRouterModel(models as OpenRouterModel[]),
    generate: openrouterGenerate,
    shortModel: shortOpenRouterModel,
  },
};

export const CLOUD_PROVIDER_IDS = Object.keys(CLOUD_PROVIDERS) as CloudProviderId[];
