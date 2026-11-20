import { useState } from 'react'
import { pdfjsLib } from './pdf.js'
import PdfPage from './PdfPage.jsx'
import Preview from './Preview.jsx'
import { maskPages } from './maskPages.js'
import { buildPdf } from './buildPdf.js'
import AutoDetect from './AutoDetect.jsx'
import { detectAll, KINDS } from './detect.js'

const ZOOMS = [50, 75, 100, 125, 150]

export default function App() {
  const [pdf, setPdf] = useState(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  // 黒塗り予定の四角。位置・大きさはページに対する割合(0〜1)で持つ
  // { id, page, x, y, w, h }
  const [rects, setRects] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [nextId, setNextId] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [preview, setPreview] = useState(null) // 黒塗り後の全ページ画像
  const [progress, setProgress] = useState('')
  const [exporting, setExporting] = useState(false)
  const [detectMessage, setDetectMessage] = useState('')

  // PDFはブラウザ内のメモリだけで扱う(送信・保存はしない)
  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      const data = new Uint8Array(await file.arrayBuffer())
      const doc = await pdfjsLib.getDocument({ data }).promise
      setPdf(doc)
      setFileName(file.name)
      setRects([])
      setSelectedId(null)
      setDetectMessage('')
    } catch {
      setPdf(null)
      setFileName('')
      setRects([])
      setError('PDFを読み込めませんでした。ファイルを確認してください。')
    }
  }

  function addRect(r) {
    const id = nextId
    setNextId(id + 1)
    setRects((prev) => [...prev, { id, ...r }])
    setSelectedId(id)
  }

  function undo() {
    setRects((prev) => prev.slice(0, -1))
    setSelectedId(null)
  }

  function deleteSelected() {
    setRects((prev) => prev.filter((r) => r.id !== selectedId))
    setSelectedId(null)
  }

  function clearAll() {
    if (rects.length === 0) return
    if (window.confirm(`黒塗り予定の範囲${rects.length}件を、すべて消しますか?`)) {
      setRects([])
      setSelectedId(null)
    }
  }

  // 文字入りPDFから候補を探し、赤枠(黒塗り予定の範囲)として追加する
  async function runDetect({ kinds, words }) {
    setError('')
    setDetectMessage('')
    setProgress('候補を探しています…')
    try {
      const { rects: found, charCount } = await detectAll(
        pdf,
        { kinds, words },
        (n, total) => setProgress(`候補を探しています…(${n}/${total}ページ)`),
      )
      let id = nextId
      const added = found.map((r) => ({ id: id++, ...r }))
      setNextId(id)
      // 前回の自動候補は入れ替える(手動の枠は残す)
      setRects((prev) => [...prev.filter((r) => !r.kind), ...added])
      setSelectedId(null)

      if (charCount === 0) {
        setDetectMessage(
          'このPDFには文字データがありません(スキャン画像の可能性があります)。文字の自動認識(OCR)は対象外のため、手動で囲んでください。',
        )
      } else if (added.length === 0) {
        setDetectMessage('候補は見つかりませんでした。手動で囲むか、単語リストを使ってください。')
      } else {
        const counts = KINDS.map((k) => [k.label, added.filter((r) => r.kind === k.id).length])
          .filter(([, c]) => c > 0)
          .map(([label, c]) => `${label}${c}件`)
        setDetectMessage(`${added.length}件の候補を追加しました(${counts.join('、')})。`)
      }
    } catch {
      setError('候補の検出に失敗しました。')
    } finally {
      setProgress('')
    }
  }

  // 書き出し前に、黒塗り後の見た目をプレビューする
  async function openPreview() {
    setError('')
    setProgress('黒塗り後の画像を作っています…')
    try {
      const masked = await maskPages(pdf, rects, (n, total) =>
        setProgress(`黒塗り後の画像を作っています…(${n}/${total}ページ)`),
      )
      setPreview(masked)
    } catch {
      setError('プレビューの作成に失敗しました。')
    } finally {
      setProgress('')
    }
  }

  // 画像だけの新しいPDFを作って、ダウンロードする
  async function exportPdf() {
    setExporting(true)
    try {
      const bytes = await buildPdf(preview)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName.replace(/\.pdf$/i, '') + '_マスク済み.pdf'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setError('PDFの書き出しに失敗しました。')
    } finally {
      setExporting(false)
    }
  }

  const pages = pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : []

  return (
    <main className="app">
      <h1>PDFマスキングツール</h1>
      <p className="note">
        PDFはこのブラウザの中だけで処理します。外部への送信や保存はしません。
      </p>

      <div className="toolbar" hidden={!!preview}>
        <label className="button">
          PDFファイルを選ぶ
          <input type="file" accept="application/pdf" onChange={handleFile} hidden />
        </label>
        <button className="button" onClick={undo} disabled={rects.length === 0}>
          元に戻す
        </button>
        <button className="button" onClick={deleteSelected} disabled={selectedId === null}>
          選んだ範囲を削除
        </button>
        <button className="button" onClick={clearAll} disabled={rects.length === 0}>
          全て消す
        </button>
        <button
          className="button primary"
          onClick={openPreview}
          disabled={rects.length === 0 || !!progress}
        >
          黒塗りして書き出す
        </button>
        <label className="zoom">
          表示の大きさ
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {z}%
              </option>
            ))}
          </select>
        </label>
      </div>

      <div hidden={!!preview}>
        <AutoDetect
          disabled={!pdf}
          busy={!!progress}
          message={detectMessage}
          onDetect={runDetect}
        />
      </div>

      {progress && <p className="info">{progress}</p>}
      {error && <p className="error">{error}</p>}
      {pdf && (
        <p className="info">
          {fileName}(全{pdf.numPages}ページ) / 黒塗り予定の範囲:{rects.length}件
          <br />
          ページ上でドラッグすると、赤枠の「黒塗り予定の範囲」を作れます。赤枠をクリックすると選べます。
        </p>
      )}

      {preview && (
        <Preview
          pages={preview}
          exporting={exporting}
          onExport={exportPdf}
          onBack={() => setPreview(null)}
        />
      )}

      <div className="viewer" hidden={!!preview}>
        {pdf ? (
          <div className="pages" style={{ width: `${zoom}%` }}>
            {pages.map((n) => (
              <PdfPage
                key={`${fileName}-${n}`}
                pdf={pdf}
                pageNumber={n}
                rects={rects.filter((r) => r.page === n)}
                selectedId={selectedId}
                onAdd={addRect}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        ) : (
          <p className="empty">PDFファイルを選ぶと、ここに全ページが表示されます。</p>
        )}
      </div>
    </main>
  )
}
