/** 衝突しにくい短い ID を生成する */
export function createId(): string {
  return crypto.randomUUID();
}
