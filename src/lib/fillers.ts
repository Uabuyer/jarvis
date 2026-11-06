/**
 * Filler speech.
 *
 * A tool call can take ten seconds, and silence that long reads as a crash. So
 * JARVIS says something the instant work starts — then goes quiet until he has
 * an answer. One acknowledgement, no progress chatter.
 *
 * The phrasing follows the character's actual grammar rather than generic
 * assistant-speak, which matters more than it sounds:
 *
 *   - Working lines are subjectless present participles: "Compiling.",
 *     "Cross-referencing." Not "I'm now checking" and never "let me".
 *   - There is no snap-to compliance formula. "Right away" and "At once" are
 *     not in his vocabulary; acknowledgement is deferential, not eager.
 *   - No filler words, no enthusiasm, no apology, no exclamation marks.
 *   - "Sir" fronted means urgency; final means routine. These are all routine,
 *     so it goes at the end, and only sometimes.
 */

/** Said as soon as the first tool fires, before any answer exists. */
const WORKING = [
  'Працюю, сер.',
  'Збираю дані.',
  'Отримую.',
  'Відкриваю архів.',
  'Звіряю.',
  'Виконую запит.',
  'Шукаю.',
  'Виконується.',
]

/** Acknowledging an order where no tool is involved. */
const ACKNOWLEDGE = [
  'Як забажаєте, сер.',
  'Добре, сер.',
  'Звісно.',
  'Зрозуміло.',
  'Вважайте, що зроблено.',
  'Негайно, сер.',
]

/** Answering to his name, before the user has said what they want. */
const ATTENTION = [
  'Так, сер?',
  'Сер?',
  'До ваших послуг, сер.',
  'На зв’язку.',
  'Я тут, сер.',
]

/**
 * Said once, when he finishes starting up. Every line ends on a question the
 * user can answer straight away, because the microphone opens right after it.
 * Unlike the routine lines above, these are meant to be playful.
 */
const GREETING_ANY = [
  'Вітаю, сер. До роботи. Чим займемося сьогодні?',
  'Вітаю, сер. Системи готові, бюджети чекають. З чого почнемо?',
  'До ваших послуг, сер. Креативи самі себе не запустять. Що робимо?',
]
const GREETING_MORNING = [
  'Доброго ранку, сер. Кава є, кабінети чекають. З чого почнемо?',
  'Доброго ранку, сер. Подивимося, що там відкрутилось за ніч?',
]
const GREETING_DAY = [
  'Доброго дня, сер. Як ваш день? Чим займемося?',
]
const GREETING_EVENING = [
  'Добрий вечір, сер. Як пройшов ваш день? Чим займемося ввечері?',
  'Добрий вечір, сер. Як день, у плюсі? Що ще зробимо сьогодні?',
]
const GREETING_NIGHT = [
  'Ще не спите, сер? Нічні заливи самі себе не перевірять. Що робимо?',
]

/** A start-up line, weighted towards the current time of day. */
export function greeting(hour = new Date().getHours()): string {
  const timed =
    hour < 5 ? GREETING_NIGHT
    : hour < 12 ? GREETING_MORNING
    : hour < 18 ? GREETING_DAY
    : GREETING_EVENING
  const pool = [...GREETING_ANY, ...timed, ...timed]
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Avoids repeating the same phrase twice running, which is what makes canned
 * lines sound canned. Keeps one slot of history per pool.
 */
function makePicker(pool: string[]) {
  let last = -1
  return () => {
    if (pool.length < 2) return pool[0] ?? ''
    let i = last
    while (i === last) i = Math.floor(Math.random() * pool.length)
    last = i
    return pool[i]
  }
}

export const working = makePicker(WORKING)
export const acknowledge = makePicker(ACKNOWLEDGE)
export const attention = makePicker(ATTENTION)

/**
 * Naming the task is warmer than a generic acknowledgement and shows the
 * integration off on camera. Still participial, still under five words.
 *
 * MCP tool names are `mcp__<server>__<tool>`, and the two halves say different
 * things: the server is who is being asked, the tool is what is being asked
 * for. Matching one flat substring against the whole string gets both wrong —
 * `mcp__playwright__browser_click` announced a web search because "browse"
 * appeared earlier in the table than "browser", `Get-Report` looked like a code
 * repository, `Get-Events` like a calendar entry, and "highlight" like a lamp.
 *
 * So: split the name, match the halves separately, order the table so the
 * specific beats the general, and put word boundaries on the short words that
 * hide inside longer ones. Either half matching is enough — the server is the
 * better signal when a name gives one, but plenty of them don't.
 */
type Rule = {
  /** Matched against the server segment, if there is one. */
  server?: RegExp
  /** Matched against the tool segment, or the whole name for a built-in. */
  tool?: RegExp
  lines: string[]
}

const FOOTAGE = ['Збираю відео.', 'Рендерю послідовність.']

const BY_TOOL: Rule[] = [
  { server: /computer/, lines: ['Відкриваю.', 'Запускаю.'] },
  // Video sits above image because higgsfield and palmier both do either, so
  // the verb in the tool name is the only thing separating them — a rule on the
  // server alone would send every generate_video to "Rendering."
  { tool: /video|footage|\bclip\b|\breel\b|talking_head/, lines: FOOTAGE },
  {
    server: /higgsfield|openrouter-image|dalle|flux|midjourney/,
    tool: /image|photo|thumbnail|render|upscale|seedream/,
    lines: ['Рендерю.', 'Створюю.'],
  },
  // The editors, once the two rules that read the verb have had their turn.
  { server: /palmier|heygen|runway|descript/, lines: FOOTAGE },
  {
    server: /playwright|puppeteer|browserbase|chrome/,
    tool: /\bbrowser\b|navigate/,
    lines: ['Відкриваю браузер.', 'Переходжу.'],
  },
  {
    server: /android|\badb\b|simulator/,
    tool: /\bdevice\b|\bapk\b|\bphone\b/,
    lines: ['Звертаюсь до пристрою.', 'Підключаюсь до телефона.'],
  },
  {
    server: /gmail|\bmail\b/,
    tool: /gmail|\bmail\b|email|inbox/,
    lines: ['Перевіряю пошту.', 'Читаю вхідні.'],
  },
  // Calendar keys off "calendar" alone. "event" used to live here, which is how
  // a Mixpanel event query came out as "Checking your calendar."
  {
    tool: /calendar|\bdiary\b|\bmeeting\b/,
    lines: ['Перевіряю календар.', 'Дивлюсь розклад.'],
  },
  {
    server: /elevenlabs|openai-tts/,
    tool: /speech|\bvoice\b|\btts\b|text_to_sound/,
    lines: ['Озвучую.', 'Працюю, сер.'],
  },
  {
    server: /spotify|sonos/,
    tool: /\bplay\b|\bmusic\b|playlist|\btrack\b/,
    lines: ['Ставлю в чергу.', 'Вмикаю.'],
  },
  {
    server: /^home|homeassistant|\bhue\b|\bhass\b/,
    tool: /\blights?\b|thermostat|\bdimmer\b/,
    lines: ['Налаштовую.', 'Займаюсь цим, сер.'],
  },
  {
    server: /github|linear|jira|sentry/,
    tool: /\brepo\b|repository|\bissues?\b|pull_request|\bcommit\b/,
    lines: ['Перевіряю репозиторій.', 'Дивлюсь трекер.'],
  },
  // Also where the anonymously named analytics servers land — theirs are bare
  // UUIDs, so only the tool half says anything: Get-Report, Get-Events,
  // Run-Query. "report" is safe from the repository rule above because that one
  // is bounded.
  {
    server: /mixpanel|clarity|posthog|amplitude/,
    tool: /analytic|\bmetrics?\b|\breports?\b|\bevents?\b|cohort|funnel|dashboard|\bquery\b/,
    lines: ['Виконую запит.', 'Отримую цифри.'],
  },
  {
    server: /\bexa\b|serper|serpapi|perplexity|tavily|brave/,
    tool: /search|\bweb\b|\bfetch\b|crawl|research/,
    lines: ['Шукаю.', 'Перевіряю джерела.'],
  },
]

const pickers = BY_TOOL.map((r) => ({ ...r, pick: makePicker(r.lines) }))

/**
 * `mcp__<server>__<tool>`, split on the first separator so tool names keep
 * their own underscores (`browser_click`, `text_to_speech`). A built-in like
 * WebSearch or Bash has no server half.
 *
 * The second form matters more than it looks: the bridge client prettifies
 * names for the HUD badge before handing them on, so what actually arrives
 * here is `higgsfield · generate image`. Parsing only the raw form meant every
 * rule below silently missed and every tool got the generic line.
 */
function split(toolName: string): { server: string; tool: string } {
  const raw = /^mcp__(.+?)__(.+)$/.exec(toolName)
  if (raw) return { server: raw[1].toLowerCase(), tool: raw[2].toLowerCase() }

  const pretty = toolName.split(' · ')
  if (pretty.length === 2) {
    return { server: pretty[0].toLowerCase(), tool: pretty[1].toLowerCase() }
  }

  return { server: '', tool: toolName.toLowerCase() }
}

/** A phrase suited to the tool that just fired. */
export function forTool(toolName: string): string {
  const { server, tool } = split(toolName)
  for (const r of pickers) {
    const hit =
      (r.server !== undefined && server !== '' && r.server.test(server)) ||
      (r.tool !== undefined && r.tool.test(tool))
    if (hit) return r.pick()
  }
  // Read, Bash, Grep and anything unrecognised: better a neutral line than a
  // confident wrong one.
  return working()
}
