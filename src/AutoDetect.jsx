import { useState } from 'react'
import { KINDS } from './detect.js'

// 「自動で候補を探す」の操作パネル
// 単語リストは、この画面の中(メモリ)だけで持つ。保存はしないので、画面を閉じると消える
export default function AutoDetect({ disabled, busy, message, onDetect }) {
  const [checked, setChecked] = useState(() => new Set(KINDS.map((k) => k.id)))
  const [wordsText, setWordsText] = useState('')

  function toggle(id) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function run() {
    const words = wordsText
      .split(/\r?\n/)
      .map((w) => w.trim())
      .filter(Boolean)
    onDetect({ kinds: checked, words })
  }

  return (
    <section className="auto">
      <h2>自動で候補を探す</h2>
      <div className="auto-kinds">
        {KINDS.map((k) => (
          <label key={k.id}>
            <input
              type="checkbox"
              checked={checked.has(k.id)}
              onChange={() => toggle(k.id)}
            />
            {k.name}
          </label>
        ))}
      </div>

      <label className="auto-words">
        単語リスト(1行に1語。全ページの全ての出現箇所を候補にします)
        <textarea
          rows={4}
          value={wordsText}
          onChange={(e) => setWordsText(e.target.value)}
          disabled={!checked.has('words')}
          autoComplete="off"
          spellCheck={false}
          placeholder={'1行に1語ずつ入力'}
        />
      </label>
      <p className="hint">入力した語は保存されません。この画面を閉じると消えます。</p>

      <button className="button" onClick={run} disabled={disabled || busy || checked.size === 0}>
        自動で候補を探す
      </button>
      {message && <p className="auto-message">{message}</p>}

      <p className="hint">
        見つかった候補は、赤枠(黒塗り予定の範囲)として追加されます。枠をクリックして選び、「選んだ範囲を削除」で1つずつ外せます。
        再度実行すると、前回の自動候補は入れ替わります(手動で作った枠は残ります)。
      </p>
      <p className="hint strong">
        ロゴや印影などの画像は、自動では検出できません。ページ上をドラッグして、手動で囲んでください。
      </p>
    </section>
  )
}
