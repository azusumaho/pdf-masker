// 書き出し時の解像度の倍率(元のPDFのサイズの約2倍)
const EXPORT_SCALE = 2
// 黒塗りの範囲を広げる余白(ページの幅に対する割合)
const MARGIN_RATIO = 0.005
const JPEG_QUALITY = 0.85

function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('画像の作成に失敗しました'))
        resolve(new Uint8Array(await blob.arrayBuffer()))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

// 全ページを画像化し、黒塗り予定の範囲を不透明な黒(#000000)で塗りつぶす
// 戻り値: [{ bytes(JPEG), width, height(pt) }]
export async function maskPages(pdf, rects, onProgress) {
  const result = []
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(n, pdf.numPages)
    const page = await pdf.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: EXPORT_SCALE })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise

    const ctx = canvas.getContext('2d')
    const margin = canvas.width * MARGIN_RATIO
    ctx.fillStyle = '#000000'
    ctx.globalAlpha = 1
    for (const r of rects.filter((r) => r.page === n)) {
      // 割合(0〜1)を画素に直し、四方に余白を付けて広げる
      const left = Math.max(0, r.x * canvas.width - margin)
      const top = Math.max(0, r.y * canvas.height - margin)
      const right = Math.min(canvas.width, (r.x + r.w) * canvas.width + margin)
      const bottom = Math.min(canvas.height, (r.y + r.h) * canvas.height + margin)
      ctx.fillRect(left, top, right - left, bottom - top)
    }

    result.push({
      bytes: await canvasToJpeg(canvas),
      width: base.width,
      height: base.height,
    })
    // 使い終わったcanvasのメモリを早めに解放する
    canvas.width = 0
    canvas.height = 0
  }
  return result
}
