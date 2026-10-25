/** クラウド AI の接続で共通に使うエラー */

/** クラウド AI のエラー（retryable: 少し待てば・別の AI なら答えられる見込みがある） */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}
