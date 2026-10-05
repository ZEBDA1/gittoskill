import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureBundle, loadTs } from './helpers.mjs'

test('Redis REST coordinates separate workers and conditionally releases only owned locks', async () => {
  const values = new Map()
  const requests = []
  const fetch = async (url, init) => {
    assert.equal(url, 'https://redis.invalid')
    assert.equal(init.headers.Authorization, 'Bearer fixture')
    const [command, ...args] = JSON.parse(init.body)
    requests.push(command)
    let result = null
    if (command === 'GET') result = values.get(args[0]) ?? null
    if (command === 'SET') {
      if (!args.includes('NX') || !values.has(args[0])) { values.set(args[0], args[1]); result = 'OK' }
    }
    if (command === 'EVAL') {
      const [script, , key, first] = args
      if (script.includes('INCR')) {
        const current = Number(values.get(key) ?? 0)
        result = current >= Number(first) ? 0 : 1
        if (result) values.set(key, String(current + 1))
      } else if (values.get(key) === first) { values.delete(key); result = 1 }
      else result = 0
    }
    return Response.json({ result })
  }
  const { RedisRestStore, cachedGeneration } = loadTs('lib/generation-store.ts', { fetch })
  const a = new RedisRestStore('https://redis.invalid', 'fixture')
  const b = new RedisRestStore('https://redis.invalid', 'fixture')
  let calls = 0
  const generate = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 30)); return fixtureBundle() }
  await Promise.all([cachedGeneration(a, 'key', 'fixture', generate), cachedGeneration(b, 'key', 'fixture', generate)])
  assert.equal(calls, 1)
  assert.equal((await cachedGeneration(b, 'key', 'fixture', generate)).cache, 'HIT')
  await a.lock('owned', 'a', 60)
  await b.unlock('owned', 'b')
  assert.equal(await a.get('owned'), 'a')
  assert.ok(requests.includes('EVAL'))
})
