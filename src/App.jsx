import { useEffect, useRef, useState } from 'react'
import { pdfjsLib } from './pdf.js'

export default function App() {
  const canvasRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  // PDFはブラウザ内のメモリだけで扱う(送信・保存はしない)
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const doc = await pdfjsLib.getDocument({ data }).promise
      setPdf(doc)
      setFileName(file.name)
    } catch {
      setPdf(null)
      setFileName('')
      setError('PDFを読み込めませんでした。ファイルを確認してください。')
    }
  }

  // 1ページ目を表示
  useEffect(() => {
    if (!pdf) return
    let task
    let cancelled = false
    ;(async () => {
      const page = await pdf.getPage(1)
      if (cancelled) return
      const viewport = page.getViewport({ scale: 1.5 })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      task = page.render({ canvas, viewport })
      try {
        await task.promise
      } catch {
        // 再描画による中断は無視
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf])

  return (
    <main className="app">
      <h1>PDFマスキングツール</h1>
      <p className="note">
        PDFはこのブラウザの中だけで処理します。外部への送信や保存はしません。
      </p>

      <label className="button">
        PDFファイルを選ぶ
        <input type="file" accept="application/pdf" onChange={handleFile} hidden />
      </label>

      {error && <p className="error">{error}</p>}
      {pdf && (
        <p className="info">
          {fileName}(全{pdf.numPages}ページ中、1ページ目を表示しています)
        </p>
      )}

      <div className="viewer">
        {pdf ? (
          <canvas ref={canvasRef} />
        ) : (
          <p className="empty">PDFファイルを選ぶと、ここに1ページ目が表示されます。</p>
        )}
      </div>
    </main>
  )
}
