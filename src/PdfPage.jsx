import { useEffect, useRef, useState } from 'react'

const RENDER_SCALE = 1.5
const MIN_SIZE = 0.005 // これより小さい四角は、クリックとみなして作らない

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// 1ページ分の表示と、黒塗り予定の四角の描画・作成を担当する
export default function PdfPage({
  pdf,
  pageNumber,
  rects,
  selectedId,
  onAdd,
  onSelect,
}) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const startRef = useRef(null)
  const [aspect, setAspect] = useState(null) // 幅 / 高さ
  const [draft, setDraft] = useState(null) // ドラッグ中の四角(割合)

  useEffect(() => {
    let task
    let cancelled = false
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = canvasRef.current
      canvas.width = viewport.width
      canvas.height = viewport.height
      setAspect(viewport.width / viewport.height)
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
  }, [pdf, pageNumber])

  // マウス位置を、ページに対する割合(0〜1)に変換する
  function toRatio(e) {
    const box = overlayRef.current.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - box.left) / box.width),
      y: clamp01((e.clientY - box.top) / box.height),
    }
  }

  function makeRect(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    }
  }

  function handlePointerDown(e) {
    if (e.button !== 0) return
    onSelect(null)
    startRef.current = toRatio(e)
    overlayRef.current.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e) {
    if (!startRef.current) return
    setDraft(makeRect(startRef.current, toRatio(e)))
  }

  function handlePointerUp(e) {
    if (!startRef.current) return
    const r = makeRect(startRef.current, toRatio(e))
    startRef.current = null
    setDraft(null)
    if (r.w >= MIN_SIZE && r.h >= MIN_SIZE) {
      onAdd({ page: pageNumber, ...r })
    }
  }

  function handlePointerCancel() {
    startRef.current = null
    setDraft(null)
  }

  const pct = (r) => ({
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  })

  return (
    <section className="page">
      <div className="page-label">{pageNumber}ページ目</div>
      <div
        className="page-body"
        style={aspect ? { aspectRatio: aspect } : undefined}
      >
        <canvas ref={canvasRef} />
        <div
          ref={overlayRef}
          className="overlay"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {rects.map((r) => (
            <div
              key={r.id}
              className={`rect${r.id === selectedId ? ' selected' : ''}`}
              style={pct(r)}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelect(r.id)
              }}
            />
          ))}
          {draft && <div className="rect draft" style={pct(draft)} />}
        </div>
      </div>
    </section>
  )
}
