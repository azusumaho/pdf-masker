// 文字入りPDFから、黒塗りの候補を見つける(すべてブラウザ内で処理する)
// 文字の位置は pdf.js の getTextContent から得る。外部には何も送らない。

export const KINDS = [
  { id: 'phone', name: '電話・FAX番号', label: '電話' },
  { id: 'postal', name: '郵便番号', label: '郵便番号' },
  { id: 'email', name: 'メールアドレス', label: 'メール' },
  { id: 'words', name: '単語リスト', label: '単語' },
]

// ハイフンの仲間(各種ダッシュ、マイナス、長音符)
const HYPHENS = /[‐-―−ー]/g

const SP = '[ \\t]*' // 同じ行の中の空白(改行はまたがない)
const AREA = '0\\d{1,4}'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g

const PHONE_RE = new RegExp(
  '(?<![0-9-])(?<![0-9],)(?:' +
    [
      // +81-6-1111-0001
      `\\+81${SP}-?${SP}[1-9]\\d{0,3}${SP}-${SP}\\d{1,4}${SP}-${SP}\\d{3,4}`,
      // (06)1111-0001 / (06) 1111 0001
      `\\(${SP}${AREA}${SP}\\)${SP}-?${SP}\\d{1,4}${SP}-?${SP}\\d{3,4}`,
      // 06-1111-0001 / 090-1234-5678 / 0120-123-456
      `${AREA}${SP}-${SP}\\d{1,4}${SP}-${SP}\\d{3,4}`,
      // 06(1111)0001
      `${AREA}${SP}\\(${SP}\\d{1,4}${SP}\\)${SP}-?${SP}\\d{3,4}`,
    ].join('|') +
    ')(?![0-9])',
  'g',
)

const POSTAL_RE = new RegExp(
  '(?<![0-9-])(?<![0-9],)(?:' +
    [`〒${SP}\\d{3}${SP}-?${SP}\\d{4}`, `\\d{3}${SP}-${SP}\\d{4}`].join('|') +
    ')(?![0-9])',
  'g',
)

function isPhoneLike(text) {
  const digits = text.replace(/\D/g, '')
  if (text.startsWith('+')) return digits.length >= 11 && digits.length <= 12 // 81 + 9〜10桁
  return digits.length >= 10 && digits.length <= 11
}

// 文字(1文字ずつの配列)を、全角・半角の違いを吸収した文字列にする
// map[i] は、変換後の文字列の i 番目が、元のどの文字(entries の添字)に当たるか
function buildForm(entries, { foldHyphen = false, lower = false, stripSpace = false } = {}) {
  let s = ''
  const map = []
  entries.forEach((e, idx) => {
    let n = e.ch.normalize('NFKC')
    if (foldHyphen) n = n.replace(HYPHENS, '-')
    if (lower) n = n.toLowerCase()
    if (stripSpace) n = n.replace(/\s/g, '')
    for (let k = 0; k < n.length; k++) map.push(idx)
    s += n
  })
  return { s, map }
}

function normalizeWord(word) {
  return word.normalize('NFKC').replace(/\s/g, '').toLowerCase()
}

// ページの文字を、1文字ずつの配列にする(item は元の文字のまとまり、i はその中の何文字目か)
function buildEntries(items) {
  const entries = []
  let prev = null
  for (const it of items) {
    if (prev) {
      const [a, b, , , pe, pf] = prev.transform
      const e = it.transform[4]
      const f = it.transform[5]
      const len = Math.hypot(a, b) || 1
      const h = Math.hypot(prev.transform[2], prev.transform[3]) || 1
      const dx = ((e - (pe + (a / len) * prev.width)) * a) / len + ((f - (pf + (b / len) * prev.width)) * b) / len
      const dy = Math.abs(((e - pe) * b) / len - ((f - pf) * a) / len)
      if (prev.hasEOL || dy > 0.5 * h) entries.push({ ch: '\n', item: null, i: 0 })
      else if (dx > 0.25 * h) entries.push({ ch: ' ', item: null, i: 0 })
    }
    let i = 0
    for (const ch of it.str) entries.push({ ch, item: it, i: i++ })
    prev = it
  }
  return entries
}

// 文字の幅の目安(全角は1、半角は0.5)
const weightCache = new WeakMap()
function prefixWeights(item) {
  let w = weightCache.get(item)
  if (!w) {
    w = [0]
    for (const ch of item.str) {
      const cp = ch.codePointAt(0)
      const half = cp < 0x100 || (cp >= 0xff61 && cp <= 0xff9f)
      w.push(w[w.length - 1] + (half ? 0.5 : 1))
    }
    weightCache.set(item, w)
  }
  return w
}

// 文字のまとまり(item)の i0〜i1 文字目を囲む四角を、ページに対する割合(0〜1)で返す
function itemBox(item, i0, i1, viewport) {
  const [a, b, c, d, e, f] = item.transform
  const lenDir = Math.hypot(a, b) || 1
  const h = Math.hypot(c, d) || 1
  const dir = [a / lenDir, b / lenDir]
  const up = [c / h, d / h]
  const w = prefixWeights(item)
  const total = w[w.length - 1] || 1
  const t0 = (w[i0] / total) * item.width
  const t1 = (w[i1 + 1] / total) * item.width

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const t of [t0, t1]) {
    for (const v of [-0.2 * h, 0.95 * h]) {
      const [px, py] = viewport.convertToViewportPoint(
        e + dir[0] * t + up[0] * v,
        f + dir[1] * t + up[1] * v,
      )
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minY = Math.min(minY, py)
      maxY = Math.max(maxY, py)
    }
  }
  const x0 = Math.max(0, minX / viewport.width)
  const y0 = Math.max(0, minY / viewport.height)
  const x1 = Math.min(1, maxX / viewport.width)
  const y1 = Math.min(1, maxY / viewport.height)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// 元の文字の範囲(entries の a〜b)を、画面に出す四角(同じ行は1つにまとめる)にする
function rangeToBoxes(entries, a, b, viewport) {
  const boxes = []
  let i = a
  while (i <= b) {
    const e = entries[i]
    if (!e.item) {
      i++
      continue
    }
    let j = i
    while (j + 1 <= b && entries[j + 1].item === e.item) j++
    boxes.push(itemBox(e.item, entries[i].i, entries[j].i, viewport))
    i = j + 1
  }
  const merged = []
  for (const box of boxes) {
    const last = merged[merged.length - 1]
    if (last) {
      const top = Math.max(last.y, box.y)
      const bottom = Math.min(last.y + last.h, box.y + box.h)
      if (bottom - top > 0.5 * Math.min(last.h, box.h)) {
        const x0 = Math.min(last.x, box.x)
        const y0 = Math.min(last.y, box.y)
        const x1 = Math.max(last.x + last.w, box.x + box.w)
        const y1 = Math.max(last.y + last.h, box.y + box.h)
        Object.assign(last, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
        continue
      }
    }
    merged.push({ ...box })
  }
  return merged
}

// 1ページ分を検出する。kinds: 検出する種類のid、words: 単語リスト(正規化前)
// 戻り値: { found: [{ kind, label, x, y, w, h }], charCount }
export async function detectPage(page, { kinds, words }) {
  const content = await page.getTextContent()
  const items = content.items.filter((it) => typeof it.str === 'string')
  const entries = buildEntries(items)
  const charCount = entries.filter((e) => e.item && /\S/.test(e.ch)).length
  const viewport = page.getViewport({ scale: 1 })

  const taken = [] // すでに候補にした範囲(重複して候補にしない)
  const found = []
  const add = (kind, a, b) => {
    if (taken.some(([x, y]) => a <= y && x <= b)) return
    taken.push([a, b])
    const label = KINDS.find((k) => k.id === kind).label
    for (const box of rangeToBoxes(entries, a, b, viewport)) {
      found.push({ kind, label, ...box })
    }
  }

  // 単語リスト(空白と大文字小文字の違いも吸収)
  if (kinds.has('words')) {
    const { s, map } = buildForm(entries, { lower: true, stripSpace: true })
    for (const raw of words) {
      const w = normalizeWord(raw)
      if (!w) continue
      let from = 0
      let idx
      while ((idx = s.indexOf(w, from)) >= 0) {
        add('words', map[idx], map[idx + w.length - 1])
        from = idx + w.length
      }
    }
  }

  // メール・電話・郵便番号(全角半角とハイフンの違いを吸収)
  const form = buildForm(entries, { foldHyphen: true })
  const scan = (kind, re, accept = () => true) => {
    for (const m of form.s.matchAll(re)) {
      if (!accept(m[0])) continue
      add(kind, form.map[m.index], form.map[m.index + m[0].length - 1])
    }
  }
  if (kinds.has('email')) scan('email', EMAIL_RE)
  if (kinds.has('phone')) scan('phone', PHONE_RE, isPhoneLike)
  if (kinds.has('postal')) scan('postal', POSTAL_RE)

  return { found, charCount }
}

// 全ページを検出する。戻り値: { rects: [{ page, kind, label, x, y, w, h }], charCount }
export async function detectAll(pdf, options, onProgress) {
  const rects = []
  let charCount = 0
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(n, pdf.numPages)
    const page = await pdf.getPage(n)
    const r = await detectPage(page, options)
    charCount += r.charCount
    for (const f of r.found) rects.push({ page: n, ...f })
  }
  return { rects, charCount }
}
