import type { Question, TenantConfig } from '@research-portal/core'
import type { AragProvider } from '@research-portal/retrieval'
import type { TenantStoreApi } from './tenants.ts'

/**
 * Starter questions asked of the knowledge box itself: "give me questions you can answer
 * well", grounded in what retrieval finds, then cached on the portal configuration so Explore
 * and Ask show them as chips without a model call per visit.
 */

const SCHEMA = {
  name: 'starter_questions',
  description: 'Questions this knowledge box answers well from its own documents',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      questions: { type: 'array', items: { type: 'string' } },
    },
    required: ['questions'],
  },
}

const INSTRUCTIONS = 'Give me questions that you can provide great answers for, from the ' +
  'documents in the context only. Each question must be fully answerable from a passage you ' +
  'were given, name the specific model, product, error code or procedure it concerns, be ' +
  'phrased the way a technician or customer would ask it, stand alone without the other ' +
  'questions, ask about one thing only so that a single passage answers it completely, and be at most 110 characters. Cover different documents and different tasks ' +
  'within the topic you were asked about. Never mention the context, the documents or the ' +
  'manuals themselves. Australian English. No numbering, no answers.'

/** Retrieval angles, asked separately so the questions spread across the collection. */
const ANGLES = [
  'installation, commissioning and initial settings',
  'troubleshooting, error codes, fault diagnosis and servicing',
  'operation, remote controllers, Wi-Fi and everyday settings',
]

/** Questions that talk about the model's own context rather than the subject. */
const META =
  /\b(context|provided|supplied|material|answerable|these documents|the documents|the manuals in)\b/i

/** Words every question shares; they say nothing about whether two questions overlap. */
const COMMON = new Set(
  ('what how does the and for are can with when which why should mitsubishi electric air ' +
    'conditioner conditioners conditioning unit units system systems indoor outdoor').split(' '),
)

export async function generateStarterQuestions(
  management: AragProvider,
  tenants: TenantStoreApi,
  config: TenantConfig,
  count = 6,
  angles: string[] = ANGLES,
): Promise<Question[]> {
  const perAngle = Math.max(2, Math.ceil(count / angles.length) + 1)
  const ask = async (angle: string): Promise<string[]> => {
    const { object, insufficientGrounding } = await management.askStructured(
      config,
      SCHEMA,
      angle,
      { instructions: `${INSTRUCTIONS} Return exactly ${perAngle} questions.`, topK: 30 },
    )
    if (insufficientGrounding) return []
    const raw = (object as { questions?: unknown })?.questions
    return (Array.isArray(raw) ? raw : []).filter((q): q is string => typeof q === 'string')
  }
  // One angle at a time, and one retry for an angle that came back empty or failed: parallel
  // structured asks were observed to come back empty for some angles.
  const batches: string[][] = []
  for (const angle of angles) {
    let batch = await ask(angle).catch(() => [] as string[])
    if (batch.length === 0) batch = await ask(angle).catch(() => [] as string[])
    console.log(JSON.stringify({ event: 'starter_questions_angle', angle, returned: batch.length }))
    batches.push(batch)
  }
  const seen = new Set<string>()
  const clean = (q: string) => q.replace(/^\s*\d+[.)]\s*/, '').trim()
  const words = (q: string) =>
    new Set((q.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? []).filter((w) => !COMMON.has(w)))
  const kept: Set<string>[] = []
  // A near-duplicate (most of its words already used by a kept question) is dropped.
  const similar = (q: string) => {
    const w = words(q)
    return kept.some((k) => {
      let shared = 0
      for (const x of w) if (k.has(x)) shared++
      return shared / Math.max(1, Math.min(w.size, k.size)) >= 0.6
    })
  }
  const usable = (q: string) => {
    const reason = q.length < 10 || q.length > 160
      ? 'length'
      : !q.endsWith('?')
      ? 'not a question'
      : META.test(q)
      ? 'mentions the context'
      : seen.has(q.toLowerCase()) || similar(q)
      ? 'duplicate'
      : undefined
    if (reason) {
      console.log(JSON.stringify({ event: 'starter_question_dropped', reason, question: q }))
      return false
    }
    seen.add(q.toLowerCase())
    kept.push(words(q))
    return true
  }
  // Round-robin across the angles so each one is represented.
  const lists = batches.map((batch) => batch.map(clean).filter(usable))
  const picked: string[] = []
  for (let i = 0; picked.length < count && lists.some((l) => l.length > i); i++) {
    for (const list of lists) {
      const next = list[i]
      if (next && picked.length < count) picked.push(next)
    }
  }
  const questions = picked.map((text, i) => ({ id: `${config.slug}-sq${i + 1}`, text }))
  // Nothing usable keeps the questions the portal already has.
  if (questions.length === 0) return []
  tenants.patch(config.slug, { suggestedQuestions: questions })
  return questions
}
