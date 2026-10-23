import type { Plan } from '../shared/schemas';

const retrievedAt = '2026-10-23T19:22:39.000Z';

/**
 * A hand-authored, clearly labelled interface sample using short passages read
 * from the linked GOV.UK pages on 2026-10-23. It is not model output and is
 * never represented as a live inference result.
 */
export const samplePlan: Plan = {
  version: 1,
  id: 'sample-uk-passport',
  title: 'Renew your UK passport',
  goal: 'Renew an adult UK passport online from within the UK',
  jurisdiction: 'United Kingdom',
  category: 'Travel & identity',
  createdAt: retrievedAt,
  updatedAt: retrievedAt,
  sources: [
    {
      id: 'S1',
      title: 'Renew or replace your adult passport',
      publisher: 'GOV.UK / HM Passport Office',
      url: 'https://www.gov.uk/renew-adult-passport',
      retrievedAt,
      publishedAt: null,
      authority: 'official',
      retrieval: 'sample',
      contentHash: '05e6b33c97a4bf84fef59d9e2e985b1761b719ff46819ff579ed1c6e02863448',
      excerpt:
        'Renew or replace your adult passport\n\nIt costs £102 to renew or replace your passport if you apply online or £115.50 if you fill in a paper form.\n\nYou must be aged 16 or over (or turning 16 in the next 3 weeks) to get an adult passport.\n\nCheck how long it will take to get a passport before you apply.\n\nDo not book travel until you have a valid passport - your new passport will not have the same number as your old one.\n\nYou can track your passport application using your application reference number.',
      stale: false,
    },
    {
      id: 'S2',
      title: 'Passport fees',
      publisher: 'GOV.UK / HM Passport Office',
      url: 'https://www.gov.uk/passport-fees',
      retrievedAt,
      publishedAt: null,
      authority: 'official',
      retrieval: 'sample',
      contentHash: '8f27befb8d212c8d2d3a2fef7a24ef8903858b81bb64b47113178f02e1e8c505',
      excerpt:
        'Passport fees\n\nHow much your passport costs depends on how you apply for it.\n\nAdult (16 and over) standard 34-page passport | Apply online: £102 | Apply by paper form: £115.50\n\nYou’ll pay a different fee if you apply for a passport from another country.',
      stale: false,
    },
  ],
  steps: [
    {
      id: 'step-1',
      title: 'Confirm the adult renewal route applies',
      instruction:
        'Use this adult process only if you are aged 16 or over, or turning 16 in the next three weeks. Otherwise, stop and find the child-passport process.',
      completionCriteria: 'You have confirmed that the adult process matches the applicant’s age.',
      status: 'supported',
      evidence: [
        {
          sourceId: 'S1',
          quote:
            'You must be aged 16 or over (or turning 16 in the next 3 weeks) to get an adult passport.',
        },
      ],
      dueDate: null,
      dependsOn: [],
      userEdited: false,
      notes: [],
    },
    {
      id: 'step-2',
      title: 'Check current processing time',
      instruction:
        'Open the linked HM Passport Office service-time guidance and check the current estimate before applying.',
      completionCriteria:
        'You have read the current processing estimate and know whether it fits your needs.',
      status: 'supported',
      evidence: [
        {
          sourceId: 'S1',
          quote: 'Check how long it will take to get a passport before you apply.',
        },
      ],
      dueDate: null,
      dependsOn: ['step-1'],
      userEdited: false,
      notes: [],
    },
    {
      id: 'step-3',
      title: 'Prepare your application details',
      instruction:
        'Set aside your current passport and a way to pay before starting. This is a practical preparation suggestion, not an explicit requirement quoted in the two sample passages.',
      completionCriteria: 'Your current passport and payment method are within reach.',
      status: 'inferred',
      evidence: [],
      dueDate: null,
      dependsOn: ['step-1'],
      userEdited: false,
      notes: [
        'This preparation suggestion is inferred and should be confirmed against the full application instructions.',
      ],
    },
    {
      id: 'step-4',
      title: 'Apply online and review the fee',
      instruction:
        'Choose the online application route and review the £102 online fee shown by HM Passport Office before paying.',
      completionCriteria:
        'You have reviewed the fee and submitted the official online application.',
      status: 'supported',
      evidence: [
        {
          sourceId: 'S1',
          quote:
            'It costs £102 to renew or replace your passport if you apply online or £115.50 if you fill in a paper form.',
        },
      ],
      dueDate: null,
      dependsOn: ['step-2', 'step-3'],
      userEdited: false,
      notes: [],
    },
    {
      id: 'step-5',
      title: 'Keep travel unbooked',
      instruction:
        'Do not book travel until your new, valid passport arrives; its number will differ from the old passport.',
      completionCriteria: 'No travel depends on an estimated passport arrival date.',
      status: 'supported',
      evidence: [
        {
          sourceId: 'S1',
          quote:
            'Do not book travel until you have a valid passport - your new passport will not have the same number as your old one.',
        },
      ],
      dueDate: null,
      dependsOn: ['step-2'],
      userEdited: false,
      notes: [],
    },
    {
      id: 'step-6',
      title: 'Track the submitted application',
      instruction:
        'Keep your application reference number and use it with the official tracking service.',
      completionCriteria:
        'You have stored the reference number and checked the application status.',
      status: 'supported',
      evidence: [
        {
          sourceId: 'S1',
          quote: 'You can track your passport application using your application reference number.',
        },
      ],
      dueDate: null,
      dependsOn: ['step-4'],
      userEdited: false,
      notes: [],
    },
  ],
  conflicts: [],
  unresolvedQuestions: [
    {
      id: 'urgent-service',
      question: 'Do you need the passport urgently?',
      reason:
        'Urgent services use separate instructions that are not included in this two-source sample. Review the linked official urgent-service page before choosing that route.',
    },
  ],
  warnings: [
    'Labelled sample only: no Nebius call was made for this plan. Fees and instructions can change; open the official sources before acting.',
  ],
  runtime: {
    mode: 'sample',
    provider: 'none',
    model: null,
    responseId: null,
    latencyMs: null,
    usage: null,
    retrieval: { tavilyCalls: 0, directFetches: 0, tavilyRequestIds: [] },
  },
  completedStepIds: [],
  sourceChecks: [],
};
