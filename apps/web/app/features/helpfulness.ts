export type HelpfulnessResult =
  | { ok: true; vote: 'yes' | 'no'; reason: string }
  | { ok: false; error: 'invalid' | 'forbidden' | 'tooLarge' | 'rateLimited' | 'unavailable' | 'notFound' }

export interface HelpfulnessView {
  enabled: boolean
  demo: boolean
  vote: 'yes' | 'no' | null
  reason: string
}