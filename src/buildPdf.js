import { PDFDocument } from 'pdf-lib'

// 黒塗り済みのJPEG画像だけから、新しいPDFを作る
// pages: [{ bytes: Uint8Array(JPEG), width, height }] (width/height はPDFの単位(pt))
// 元のPDFは一切読み込まないので、元の文字データやメタデータは混ざらない
export async function buildPdf(pages) {
  // updateMetadata: false で、作成日時・更新日時・Producer・Creator の自動設定を止める
  // setTitle などは呼ばない(呼ぶと情報辞書が作られるため)。情報辞書そのものを作らない
  const doc = await PDFDocument.create({ updateMetadata: false })

  for (const p of pages) {
    const image = await doc.embedJpg(p.bytes)
    const page = doc.addPage([p.width, p.height])
    page.drawImage(image, { x: 0, y: 0, width: p.width, height: p.height })
  }

  return doc.save({ useObjectStreams: false })
}
