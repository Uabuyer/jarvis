#!/usr/bin/env node
// Connects an ElevenLabs voice: asks for the key and writes .env.bridge.local,
// so nobody has to create a dotfile by hand. Usage: npm run voice
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'

const FILE = '.env.bridge.local'
const tty = !!process.stdin.isTTY
let muted = false

const output = new Writable({
  write(chunk, _enc, done) {
    if (!muted) process.stdout.write(chunk)
    done()
  },
})
const rl = createInterface({ input: process.stdin, output, terminal: tty })
const lines = rl[Symbol.asyncIterator]()

async function ask(prompt, { hidden = false } = {}) {
  process.stdout.write(prompt)
  muted = hidden
  const { value, done } = await lines.next()
  muted = false
  if (hidden && tty) process.stdout.write('\n')
  return done ? null : value.trim()
}

function current() {
  if (!existsSync(FILE)) return {}
  const found = {}
  for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (m) found[m[1]] = m[2]
  }
  return found
}

/** Changes these settings and leaves every other line of the file alone. */
function save(values) {
  const kept = existsSync(FILE) ? readFileSync(FILE, 'utf8').split(/\r?\n/) : []
  const out = kept.filter((line) => {
    const m = /^([A-Z_]+)=/.exec(line.trim())
    return !(m && m[1] in values)
  })
  while (out.length && !out[out.length - 1].trim()) out.pop()
  for (const [k, v] of Object.entries(values)) out.push(`${k}=${v}`)
  writeFileSync(FILE, `${out.join('\n')}\n`, { mode: 0o600 })
  chmodSync(FILE, 0o600)
}

/** 'ok', 'invalid', 'limited' (real key, missing a permission) or 'offline'. */
async function check(key) {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(15000),
    })
    if (res.ok) return 'ok'
    const body = await res.text()
    return /missing_permissions/.test(body) ? 'limited' : 'invalid'
  } catch {
    return 'offline'
  }
}

const had = current()
console.log('\nПідключення голосу ElevenLabs')
console.log('Ключ створюється на https://elevenlabs.io/app/settings/api-keys')
console.log('Він зберігається лише на цьому комп\'ютері. Нікому його не показуй.\n')

let key = null
while (!key) {
  const typed = await ask(
    had.ELEVENLABS_API_KEY
      ? 'Встав новий ключ або натисни Enter, щоб залишити поточний (символи не видно): '
      : 'Встав ключ і натисни Enter (символи не видно): ',
    { hidden: true },
  )
  if (typed === null) process.exit(1)
  if (!typed) {
    if (had.ELEVENLABS_API_KEY) {
      key = had.ELEVENLABS_API_KEY
      break
    }
    continue
  }
  const verdict = await check(typed)
  if (verdict === 'invalid') {
    console.log('ElevenLabs не прийняв цей ключ. Скопіюй його ще раз.\n')
    continue
  }
  if (verdict === 'limited') {
    console.log('Ключ справжній, але йому бракує дозволів. Увімкни для нього Text to Speech, Speech to Text і Voices.')
  } else if (verdict === 'offline') {
    console.log('Не вдалося перевірити ключ: немає зв\'язку з ElevenLabs. Зберігаю його без перевірки.')
  } else {
    console.log('Ключ прийнято.')
  }
  key = typed
}

const values = { ELEVENLABS_API_KEY: key }
if (!had.JARVIS_STT_LANGUAGE) values.JARVIS_STT_LANGUAGE = 'uk'

const voiceId = await ask('\nID свого голосу, якщо хочеш інший. Натисни Enter, щоб пропустити: ')
if (voiceId) {
  if (/^[A-Za-z0-9]{10,40}$/.test(voiceId)) values.JARVIS_VOICE_ID = voiceId
  else console.log('Це не схоже на ID голосу, тому голос лишається без змін.')
}

save(values)
rl.close()
console.log('\nГотово. Запусти Jarvis або перезапусти його, якщо він уже працює: npm start\n')
process.exit(0)
