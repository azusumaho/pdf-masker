import * as pdfjsLib from 'pdfjs-dist'
// ワーカーは外部CDNではなく、プロジェクト内に同梱したファイルを使う
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }
