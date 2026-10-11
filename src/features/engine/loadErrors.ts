/**
 * モデル読み込みエラーの分類と、ユーザー向けの説明。
 * LiteRT-LM（C++ / Wasm）のエラーメッセージは英語で原因が分かりにくいため、ここで翻訳する。
 */
import { isBrowserCompatibleName, isGpuOnlyModel } from '@/lib/llm/modelCatalog';
import { isWebGpuError } from './backend';

export type LoadErrorKind =
  | 'webgpu'
  /** WebGPU 専用モデルを CPU で動かそうとした */
  | 'gpu-only'
  | 'streaming-unsupported'
  | 'invalid-file'
  | 'memory'
  | 'unknown';

export function classifyLoadError(message: string): LoadErrorKind {
  if (isWebGpuError(message)) return 'webgpu';
  if (/streaming .*not supported|unsupported model type for streaming/i.test(message)) {
    return 'streaming-unsupported';
  }
  if (/invalid magic number|not valid flatbuffer|failed to read/i.test(message)) {
    return 'invalid-file';
  }
  if (
    /out of memory|allocation failed|array buffer allocation|cannot enlarge memory|oom/i.test(
      message,
    )
  ) {
    return 'memory';
  }
  return 'unknown';
}

/** エラーの説明文（原文のメッセージの補足として表示する） */
export function explainLoadError(kind: LoadErrorKind, fileName: string): string | undefined {
  const webHint = isBrowserCompatibleName(fileName)
    ? ''
    : ' ファイル名が「-web.litertlm」で終わる Web 版か、Qwen3 0.6B などブラウザで動作確認されたモデルを使ってください。';
  switch (kind) {
    case 'webgpu':
      return isGpuOnlyModel(fileName)
        ? 'この端末では WebGPU が使えないようです。このモデルは WebGPU 専用のため、Qwen3 0.6B など CPU でも動くモデルを使ってください。'
        : 'この端末では WebGPU が使えないようです。CPU で読み込めます。';
    case 'gpu-only':
      return 'このモデル（Gemma 4 の Web 版）は WebGPU 専用で、CPU では動きません。WebGPU を有効にするか、Qwen3 0.6B など CPU でも動くモデルを使ってください。';
    case 'streaming-unsupported':
      return `このモデルファイルは、Web 版 LiteRT-LM がまだ対応していない形式を含んでいます。${webHint}`;
    case 'invalid-file':
      return `LiteRT-LM のモデルファイルではないか、ファイルが壊れている可能性があります。${webHint}`;
    case 'memory':
      return isBrowserCompatibleName(fileName)
        ? 'メモリが不足しています。他のタブやアプリを閉じるか、より小さいモデル・短い文脈長を試してください。'
        : 'メモリが不足しています。Web 版ではないモデルはファイル全体を一度にメモリへ確保する必要があり、スマホでは容量が足りないことがあります。ファイル名が「-web.litertlm」で終わる Web 版か、Qwen3 0.6B などの小さいモデルを使ってください。';
    default:
      return isBrowserCompatibleName(fileName) ? undefined : webHint.trim();
  }
}
