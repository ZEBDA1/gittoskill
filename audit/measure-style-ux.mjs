import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const origin = 'http://127.0.0.1:3217'
const html = await (await fetch(origin)).text()
const assets = []
for (const match of html.matchAll(/<script\b([^>]*?)src="([^"]+)"[^>]*>/g)) {
  if (!match[2].startsWith('/_next/static/') || assets.some(asset => asset.url === match[2])) continue
  const bytes = new Uint8Array(await (await fetch(`${origin}${match[2]}`)).arrayBuffer())
  assets.push({ url: match[2], nomodule: /noModule|nomodule/i.test(match[0]), bytes: bytes.length, gzip: gzipSync(bytes).length })
}
const result = { assets, modernBytes: assets.filter(item => !item.nomodule).reduce((sum, item) => sum + item.bytes, 0), modernGzipBytes: assets.filter(item => !item.nomodule).reduce((sum, item) => sum + item.gzip, 0) }
await fs.writeFile(path.join(import.meta.dirname, 'bundle-results-style-ux.json'), JSON.stringify(result, null, 2))
const cases = []
for (const [body, contentType] of [['null','application/json'], ['{','application/json'], ['{"profile":"a/b"}','application/json'], [' '.repeat(5000),'application/json'], ['{}','text/plain'], ['{"profile":"@fixture"}','application/json']]) {
  const response = await fetch(`${origin}/api/generate-skill`, { method: 'POST', headers: {'Content-Type': contentType}, body })
  cases.push({ input: body.length > 100 ? 'oversized' : body, status: response.status, body: await response.json() })
}
await fs.writeFile(path.join(import.meta.dirname, 'http-results-style-ux.json'), JSON.stringify(cases, null, 2))
console.log(JSON.stringify({ bundle: result, http: cases }, null, 2))
