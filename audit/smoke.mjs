import fs from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dirname, '..')
const base = 'http://127.0.0.1:3217'
const results = []
for (const [name, body] of [
  ['null', 'null'], ['empty object', '{}'], ['invalid profile', '{"profile":"a/b"}'],
  ['broken JSON', '{'], ['valid input, no credentials', '{"profile":"@fixture"}'],
]) {
  const start = performance.now()
  const response = await fetch(`${base}/api/generate-skill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  results.push({ name, status: response.status, type: response.headers.get('content-type'), milliseconds: Math.round(performance.now() - start), body: (await response.text()).slice(0, 250) })
}
const page = await fetch(base)
const html = await page.text()
const scripts = [...new Set([...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(m => m[1]))]
const sizes = []
for (const script of scripts) {
  const body = Buffer.from(await (await fetch(new URL(script, base))).arrayBuffer())
  sizes.push({ script, bytes: body.length, gzipBytes: gzipSync(body).length })
}
results.push({ name: 'Initial HTML and JavaScript assets', status: page.status, htmlBytes: Buffer.byteLength(html), scriptCount: scripts.length, jsBytes: sizes.reduce((s,v)=>s+v.bytes,0), jsGzipBytes: sizes.reduce((s,v)=>s+v.gzipBytes,0), assets: sizes, note: 'Asset bytes only; no browser execution or Core Web Vitals measurement.' })
await fs.writeFile(path.join(root, 'audit/http-results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
