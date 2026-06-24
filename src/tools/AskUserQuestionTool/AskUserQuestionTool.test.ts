import { beforeEach, describe, expect, it, mock } from 'bun:test'

let mockAllowedChannels: string[] = []
let mockPreviewFormat: string | undefined

const bootstrapPaths = [
  import.meta.resolve('../../bootstrap/state.ts'),
  import.meta.resolve('../../bootstrap/state.js'),
  import.meta.resolve('src/bootstrap/state.js'),
]

const actualBootstrapState = await import(
  import.meta.resolve('../../bootstrap/state.ts'),
)

for (const bootstrapPath of bootstrapPaths) {
  mock.module(bootstrapPath, () => ({
    ...actualBootstrapState,
    getAllowedChannels: () => mockAllowedChannels,
    getQuestionPreviewFormat: () => mockPreviewFormat,
  }))
}

const { AskUserQuestionTool } = await import(
  import.meta.resolve('./AskUserQuestionTool.tsx'),
)

beforeEach(() => {
  mockAllowedChannels = []
  mockPreviewFormat = undefined
})

describe('AskUserQuestionTool runtime contract', () => {
  it('asks for permission and echoes collected answers', async () => {
    const input = {
      questions: [
        {
          question: 'Which option?',
          header: 'Choice',
          options: [
            { label: 'A', description: 'Use option A' },
            { label: 'B', description: 'Use option B' },
          ],
        },
      ],
      answers: {
        'Which option?': 'A',
      },
    }

    expect(await AskUserQuestionTool.validateInput!(input as never)).toEqual({
      result: true,
    })
    expect(await AskUserQuestionTool.checkPermissions!(input as never)).toEqual({
      behavior: 'ask',
      message: 'Answer questions?',
      updatedInput: input,
    })

    const result = await AskUserQuestionTool.call!(input as never, {} as never)
    expect(result.data).toEqual({
      questions: input.questions,
      answers: input.answers,
    })
  })

  it('preserves annotations when present', async () => {
    const result = await AskUserQuestionTool.call!(
      {
        questions: [
          {
            question: 'Pick one?',
            header: 'Pick',
            options: [
              { label: 'One', description: 'First' },
              { label: 'Two', description: 'Second' },
            ],
          },
        ],
        answers: {
          'Pick one?': 'Two',
        },
        annotations: {
          'Pick one?': {
            notes: 'Prefer the second path',
          },
        },
      } as never,
      {} as never,
    )

    expect(result.data.annotations).toEqual({
      'Pick one?': {
        notes: 'Prefer the second path',
      },
    })
  })
})
