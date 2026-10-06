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
  '(installation, operation, servicing, troubleshooting, controls). Australian English. No ' +
  'numbering, no answers.'

export async function generateStarterQuestions(
  management: AragProvider,
  tenants: TenantStoreApi,
  config: TenantConfig,
  count = 6,
): Promise<Question[]> {
  const query = `${config.branding.tagline}: installation, operation, servicing, ` +
    'troubleshooting and error codes, controls and settings'
  const { object, insufficientGrounding } = await management.askStructured(
    config,
    SCHEMA,
    query,
    { instructions: `${INSTRUCTIONS} Return exactly ${count} questions.`, topK: 40 },
  )
  if (insufficientGrounding) {
    throw new Error('The knowledge box found nothing to ground questions on')
  }
  const raw = (object as { questions?: unknown })?.questions
  const seen = new Set<string>()
  const questions = (Array.isArray(raw) ? raw : [])
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((q) => q.length >= 10 && q.length <= 160 && q.endsWith('?'))
    .filter((q) => !seen.has(q.toLowerCase()) && seen.add(q.toLowerCase()))
    .slice(0, count)
    .map((text, i) => ({ id: `${config.slug}-sq${i + 1}`, text }))
  // Nothing usable keeps the questions the portal already has.
  if (questions.length === 0) return []
  tenants.patch(config.slug, { suggestedQuestions: questions })
  return questions
}
