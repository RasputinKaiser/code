import { describe, expect, it } from 'bun:test'
import {
  extractRoutineRecords,
  summarizeRoutine,
} from './agents-platform.js'

describe('agents-platform routine adapter', () => {
  it('treats a trigger-backed record as a single scheduled routine', () => {
    const records = extractRoutineRecords({
      id: 'trigger_123',
      name: 'Nightly docs drift',
      cron_expression: '0 9 * * 1-5',
      enabled: true,
      next_run_at: '2026-04-15T09:00:00Z',
      mcp_connections: [{}, {}],
      job_config: {
        ccr: {
          environment_id: 'env_docs',
          session_context: {
            model: 'claude-sonnet-4-6',
            sources: [
              {
                git_repository: {
                  url: 'https://github.com/noumena/ncode',
                },
              },
            ],
          },
          events: [
            {
              data: {
                message: {
                  content: 'Inspect merged PRs and flag documentation drift.',
                },
              },
            },
          ],
        },
      },
    })

    expect(records).toHaveLength(1)
    expect(summarizeRoutine(records[0]!, 0)).toMatchObject({
      id: 'trigger_123',
      name: 'Nightly docs drift',
      scheduleTriggerId: 'trigger_123',
      cronExpression: '0 9 * * 1-5',
      enabled: true,
      environmentId: 'env_docs',
      model: 'claude-sonnet-4-6',
      repoUrls: ['https://github.com/noumena/ncode'],
      promptPreview: 'Inspect merged PRs and flag documentation drift.',
      mcpConnectionCount: 2,
      triggerCount: 1,
    })
  })

  it('prefers routine identity while pulling schedule fields from nested triggers', () => {
    const records = extractRoutineRecords({
      routines: [
        {
          id: 'routine_456',
          name: 'Deploy verification',
          prompt: 'Verify the latest production deploy and summarize regressions.',
          triggers: [
            {
              id: 'trigger_sched_456',
              type: 'schedule',
              cron_expression: '0 0 * * *',
              enabled: false,
              next_run_at: '2026-04-16T00:00:00Z',
              mcp_connections: [{}],
              job_config: {
                ccr: {
                  environment_id: 'env_prod',
                  session_context: {
                    model: 'claude-opus-4-6',
                    sources: [
                      {
                        git_repository: {
                          url: 'https://github.com/noumena/platform',
                        },
                      },
                    ],
                  },
                },
              },
            },
            {
              id: 'trigger_api_456',
              type: 'api',
            },
          ],
        },
      ],
    })

    expect(records).toHaveLength(1)
    expect(summarizeRoutine(records[0]!, 0)).toMatchObject({
      id: 'routine_456',
      name: 'Deploy verification',
      scheduleTriggerId: 'trigger_sched_456',
      cronExpression: '0 0 * * *',
      enabled: false,
      environmentId: 'env_prod',
      model: 'claude-opus-4-6',
      repoUrls: ['https://github.com/noumena/platform'],
      promptPreview: 'Verify the latest production deploy and summarize regressions.',
      mcpConnectionCount: 1,
      triggerCount: 2,
    })
  })
})
