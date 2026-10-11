/**
 * 画像ファイルを縮小して data URL にする（カードに埋め込むため）。
 * 長い辺を maxSize px までに縮め、WebP（使えなければ JPEG）で保存する。
 */
export async function imageToDataUrl(file: File, maxSize = 800, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選んでください');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像を処理できませんでした');
    // 透過部分が黒くならないよう白で塗ってから描く（JPEG になる場合に備えて）
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const webp = canvas.toDataURL('image/webp', quality);
    // WebP で書き出せないブラウザは PNG を返すので、そのときは JPEG にする
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
  } finally {
    bitmap.close();
  }
}
