import { z } from 'zod';

export const EvidenceStatusSchema = z.enum([
  'supported',
  'inferred',
  'conflicting',
  'unverifiable',
]);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

const HttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), 'Only HTTP(S) URLs are supported');

export const DocumentInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  text: z.string().min(1).max(40_000),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

export const TaskInputSchema = z.object({
  task: z.string().trim().min(8).max(4_000),
  jurisdiction: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(80),
  details: z.string().trim().max(8_000).default(''),
  sourceUrls: z.array(HttpUrlSchema).max(6).default([]),
  document: DocumentInputSchema.nullable().default(null),
});
export type TaskInput = z.infer<typeof TaskInputSchema>;

export const IntakeRequestSchema = TaskInputSchema;
export type IntakeRequest = z.infer<typeof IntakeRequestSchema>;

export const QuestionSchema = z.object({
  id: z.string().min(1).max(80),
  question: z.string().trim().min(3).max(500),
  reason: z.string().trim().min(3).max(500),
});
export type Question = z.infer<typeof QuestionSchema>;

export const RuntimeUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const RuntimeReceiptSchema = z.object({
  mode: z.enum(['live', 'sample']),
  provider: z.enum(['nebius', 'none']),
  model: z.string().nullable(),
  responseId: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  usage: RuntimeUsageSchema.nullable(),
  retrieval: z.object({
    tavilyCalls: z.number().int().nonnegative(),
    directFetches: z.number().int().nonnegative(),
    tavilyRequestIds: z.array(z.string().max(200)).max(2),
  }),
});
export type RuntimeReceipt = z.infer<typeof RuntimeReceiptSchema>;

export const IntakeResponseSchema = z.object({
  goal: z.string().trim().min(5).max(500),
  questions: z.array(QuestionSchema).max(5),
  searchQueries: z.array(z.string().trim().min(3).max(300)).max(2),
  runtime: RuntimeReceiptSchema,
});
export type IntakeResponse = z.infer<typeof IntakeResponseSchema>;

export const PlanRequestSchema = TaskInputSchema.extend({
  goal: z.string().trim().min(5).max(500),
  searchQueries: z.array(z.string().trim().min(3).max(300)).max(2),
  answers: z
    .array(
      z.object({
        question: z.string().trim().min(3).max(500),
        answer: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(5),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

export const EvidenceCitationSchema = z.object({
  sourceId: z.string().min(1).max(100),
  quote: z.string().trim().min(8).max(1_200),
});
export type EvidenceCitation = z.infer<typeof EvidenceCitationSchema>;

export const SourceSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  publisher: z.string().trim().min(1).max(200),
  url: HttpUrlSchema.nullable(),
  retrievedAt: z.string().datetime({ offset: true }),
  publishedAt: z.string().trim().max(100).nullable(),
  authority: z.enum(['official', 'primary', 'secondary', 'user']),
  retrieval: z.enum(['direct', 'tavily', 'upload', 'sample']),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  excerpt: z.string().max(3_000),
  stale: z.boolean(),
});
export type Source = z.infer<typeof SourceSchema>;

export const PlanStepSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().trim().min(2).max(240),
  instruction: z.string().trim().min(3).max(1_500),
  completionCriteria: z.string().trim().min(3).max(700),
  status: EvidenceStatusSchema,
  evidence: z.array(EvidenceCitationSchema).max(4),
  dueDate: z.string().trim().max(100).nullable(),
  dependsOn: z.array(z.string().min(1).max(100)).max(12),
  userEdited: z.boolean(),
  notes: z.array(z.string().max(500)).max(5),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ConflictSchema = z.object({
  id: z.string().min(1).max(100),
  topic: z.string().trim().min(2).max(240),
  detail: z.string().trim().min(3).max(1_200),
  sourceIds: z.array(z.string().min(1).max(100)).min(2).max(6),
  stepIds: z.array(z.string().min(1).max(100)).min(1).max(20),
  evidence: z.array(EvidenceCitationSchema).min(2).max(6),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const SourceCheckSchema = z.object({
  sourceId: z.string(),
  status: z.enum(['unchanged', 'changed', 'unavailable', 'not-checkable']),
  checkedAt: z.string().datetime({ offset: true }),
  detail: z.string().max(400),
  currentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
});
export type SourceCheck = z.infer<typeof SourceCheckSchema>;

export const PlanSchema = z.object({
  version: z.literal(1),
  id: z.string().min(8).max(100),
  title: z.string().trim().min(3).max(240),
  goal: z.string().trim().min(5).max(500),
  jurisdiction: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(80),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  sources: z.array(SourceSchema).max(6),
  steps: z.array(PlanStepSchema).min(1).max(20),
  conflicts: z.array(ConflictSchema).max(10),
  unresolvedQuestions: z.array(QuestionSchema).max(10),
  warnings: z.array(z.string().max(500)).max(20),
  runtime: RuntimeReceiptSchema,
  completedStepIds: z.array(z.string()).max(20),
  sourceChecks: z.array(SourceCheckSchema).max(6).default([]),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanResponseSchema = z.object({ plan: PlanSchema });
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

export const VerifySourcesRequestSchema = z.object({
  sources: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        url: HttpUrlSchema.nullable(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(6),
});
export type VerifySourcesRequest = z.infer<typeof VerifySourcesRequestSchema>;

export const VerifySourcesResponseSchema = z.object({
  checks: z.array(SourceCheckSchema).max(6),
});
export type VerifySourcesResponse = z.infer<typeof VerifySourcesResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  liveInferenceConfigured: z.boolean(),
  tavilyConfigured: z.boolean(),
  model: z.string(),
  provider: z.literal('nebius'),
  liveInferenceVerified: z.literal(false),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
}
