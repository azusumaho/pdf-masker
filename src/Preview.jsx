import { useEffect, useState } from 'react'

// 書き出し前の、黒塗り後の見た目の確認画面
export default function Preview({ pages, onExport, onBack, exporting }) {
  const [urls, setUrls] = useState([])

  useEffect(() => {
    const list = pages.map((p) =>
      URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })),
    )
    setUrls(list)
    return () => list.forEach((u) => URL.revokeObjectURL(u))
  }, [pages])

  return (
    <div className="preview">
      <p className="warning">
        文字の塗り残しがないか、必ず目視で確認してください。
        <br />
        ロゴや印影などの画像も、黒塗りされているか確認してください。
      </p>
      <div className="toolbar">
        <button className="button" onClick={onExport} disabled={exporting}>
          {exporting ? '書き出し中…' : 'この内容で書き出す'}
        </button>
        <button className="button" onClick={onBack} disabled={exporting}>
          戻る
        </button>
      </div>
      <div className="preview-pages">
        {urls.map((u, i) => (
          <figure key={u} className="preview-page">
            <figcaption>{i + 1}ページ目(黒塗り後)</figcaption>
            <img src={u} alt={`${i + 1}ページ目の黒塗り後のプレビュー`} />
          </figure>
        ))}
      </div>
    </div>
  )
}
