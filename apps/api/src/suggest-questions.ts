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
  'questions, and be at most 110 characters. Cover different documents and different tasks ' +
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

export async function generateStarterQuestions(
  management: AragProvider,
  tenants: TenantStoreApi,
  config: TenantConfig,
  count = 6,
  angles: string[] = ANGLES,
): Promise<Question[]> {
  const perAngle = Math.max(2, Math.ceil(count / angles.length) + 1)
  const batches = await Promise.all(angles.map(async (angle) => {
    const { object, insufficientGrounding } = await management.askStructured(
      config,
      SCHEMA,
      angle,
      { instructions: `${INSTRUCTIONS} Return exactly ${perAngle} questions.`, topK: 30 },
    )
    if (insufficientGrounding) return [] as string[]
    const raw = (object as { questions?: unknown })?.questions
    return (Array.isArray(raw) ? raw : []).filter((q): q is string => typeof q === 'string')
  }))
  const seen = new Set<string>()
  const clean = (q: string) => q.replace(/^\s*\d+[.)]\s*/, '').trim()
  const usable = (q: string) =>
    q.length >= 10 && q.length <= 160 && q.endsWith('?') && !META.test(q) &&
    !seen.has(q.toLowerCase()) && Boolean(seen.add(q.toLowerCase()))
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
