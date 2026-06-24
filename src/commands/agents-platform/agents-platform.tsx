import axios from 'axios'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Select, type OptionWithDescription } from '../../components/CustomSelect/select.js'
import { Byline } from '../../components/design-system/Byline.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { KeyboardShortcutHint } from '../../components/design-system/KeyboardShortcutHint.js'
import { LoadingState } from '../../components/design-system/LoadingState.js'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { getAuthRuntime } from '../../auth/runtime/AuthRuntime.js'
import { toError } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { buildNoumenaPlatformUrl } from '../../utils/platformUrls.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { cronToHuman } from '../../utils/cron.js'
import { resolveScheduledRoutineApiSession } from './agentsPlatformSession.js'

const DIALOG_TITLE = 'Routines'
const ROUTINES_PAGE_HINT = 'Manage in the Noumena web app'
const TRIGGERS_BETA = 'ccr-triggers-2026-01-30'

type PathSegment = string | number

type RoutineRecord = Record<string, unknown>

export type RoutineSummary = {
  id: string
  name: string
  scheduleTriggerId: string | null
  cronExpression: string | null
  enabled: boolean | null
  nextRunAt: string | null
  environmentId: string | null
  model: string | null
  repoUrls: string[]
  promptPreview: string | null
  mcpConnectionCount: number
  triggerCount: number
}

type Props = {
  onDone: LocalJSXCommandOnDone
  context: LocalJSXCommandContext
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getNested(value: unknown, path: PathSegment[]): unknown {
  let current: unknown = value
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment >= current.length) {
        return undefined
      }
      current = current[segment]
      continue
    }
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

function getFirstString(value: unknown, paths: PathSegment[][]): string | null {
  for (const path of paths) {
    const candidate = getNested(value, path)
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim()
    }
  }
  return null
}

function getFirstBoolean(
  value: unknown,
  paths: PathSegment[][],
): boolean | null {
  for (const path of paths) {
    const candidate = getNested(value, path)
    if (typeof candidate === 'boolean') {
      return candidate
    }
  }
  return null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function getRecordArray(value: unknown, path: PathSegment[]): RoutineRecord[] {
  return asArray(getNested(value, path)).filter(isRecord)
}

function previewText(value: string | null, maxChars: number): string | null {
  if (!value) return null
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}...`
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

export function extractRoutineRecords(payload: unknown): RoutineRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord)
  }
  if (!isRecord(payload)) {
    return []
  }

  const listLikePaths: PathSegment[][] = [
    ['routines'],
    ['triggers'],
    ['items'],
    ['results'],
    ['data'],
  ]
  for (const path of listLikePaths) {
    const candidate = getNested(payload, path)
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return getFirstString(payload, [['id'], ['trigger_id'], ['uuid']])
    ? [payload]
    : []
}

function extractRepoUrls(trigger: RoutineRecord): string[] {
  const paths: PathSegment[][] = [
    ['job_config', 'ccr', 'session_context', 'sources'],
    ['job_config', 'session_context', 'sources'],
  ]

  const urls = new Set<string>()
  for (const path of paths) {
    for (const source of asArray(getNested(trigger, path))) {
      const url = getFirstString(source, [
        ['git_repository', 'url'],
        ['gitRepository', 'url'],
      ])
      if (url) {
        urls.add(url)
      }
    }
  }
  return [...urls]
}

function extractPromptPreview(trigger: RoutineRecord): string | null {
  const direct = getFirstString(trigger, [
    ['job_config', 'ccr', 'events', 0, 'data', 'message', 'content'],
    ['job_config', 'events', 0, 'data', 'message', 'content'],
    ['prompt'],
  ])
  return previewText(direct, 240)
}

function getScheduleTrigger(
  record: RoutineRecord,
): RoutineRecord | null {
  const triggerArrays: PathSegment[][] = [
    ['triggers'],
    ['schedule_triggers'],
    ['scheduleTriggers'],
  ]
  for (const path of triggerArrays) {
    const candidates = getRecordArray(record, path)
    for (const candidate of candidates) {
      const triggerType = getFirstString(candidate, [['type'], ['trigger_type']])
      if (
        triggerType === 'schedule' ||
        getFirstString(candidate, [['cron_expression'], ['cronExpression']])
      ) {
        return candidate
      }
    }
    if (candidates.length > 0) {
      return candidates[0] ?? null
    }
  }

  if (
    getFirstString(record, [['cron_expression'], ['cronExpression']]) ||
    getFirstString(record, [['trigger_id']])
  ) {
    return record
  }
  return null
}

function getTriggerCount(record: RoutineRecord): number {
  const triggerArrays: PathSegment[][] = [
    ['triggers'],
    ['schedule_triggers'],
    ['scheduleTriggers'],
  ]
  for (const path of triggerArrays) {
    const candidates = getRecordArray(record, path)
    if (candidates.length > 0) {
      return candidates.length
    }
  }
  return getScheduleTrigger(record) ? 1 : 0
}

function getMcpConnectionCount(
  record: RoutineRecord,
  scheduleTrigger: RoutineRecord | null,
): number {
  const topLevelCount = asArray(record.mcp_connections).length
  if (topLevelCount > 0) {
    return topLevelCount
  }
  return scheduleTrigger ? asArray(scheduleTrigger.mcp_connections).length : 0
}

export function summarizeRoutine(
  record: RoutineRecord,
  index: number,
): RoutineSummary {
  const scheduleTrigger = getScheduleTrigger(record)
  const scheduleSource = scheduleTrigger ?? record
  const id =
    getFirstString(record, [['routine_id'], ['routineId'], ['id'], ['uuid']]) ??
    `routine-${index + 1}`
  const name =
    getFirstString(record, [['name'], ['title']]) ?? `Routine ${index + 1}`
  const cronExpression = getFirstString(scheduleSource, [
    ['cron_expression'],
    ['cronExpression'],
    ['schedule', 'cron_expression'],
  ])
  const enabled = getFirstBoolean(scheduleSource, [
    ['enabled'],
    ['is_enabled'],
    ['active'],
  ])
  const nextRunAt = getFirstString(scheduleSource, [
    ['next_run_at'],
    ['nextRunAt'],
    ['next_run_time'],
    ['nextRunTime'],
  ])
  const environmentId = getFirstString(scheduleSource, [
    ['job_config', 'ccr', 'environment_id'],
    ['job_config', 'environment_id'],
  ])
  const model = getFirstString(scheduleSource, [
    ['job_config', 'ccr', 'session_context', 'model'],
    ['job_config', 'session_context', 'model'],
  ])
  const repoUrls =
    extractRepoUrls(record).length > 0
      ? extractRepoUrls(record)
      : extractRepoUrls(scheduleSource)
  const promptPreview =
    extractPromptPreview(record) ?? extractPromptPreview(scheduleSource)
  const scheduleTriggerId = getFirstString(scheduleSource, [
    ['id'],
    ['trigger_id'],
    ['uuid'],
  ])

  return {
    id,
    name,
    scheduleTriggerId,
    cronExpression,
    enabled,
    nextRunAt,
    environmentId,
    model,
    repoUrls,
    promptPreview,
    mcpConnectionCount: getMcpConnectionCount(record, scheduleTrigger),
    triggerCount: getTriggerCount(record),
  }
}

function describeEnabled(enabled: boolean | null): string {
  if (enabled === null) return 'status unknown'
  return enabled ? 'enabled' : 'disabled'
}

function getRoutineSubtitle(routine: RoutineSummary): string {
  const parts = [describeEnabled(routine.enabled)]
  if (routine.cronExpression) {
    parts.push(cronToHuman(routine.cronExpression, { utc: true }))
  }
  if (routine.nextRunAt) {
    parts.push(`next ${formatTimestamp(routine.nextRunAt)}`)
  }
  return parts.join(' · ')
}

function listDescription(routine: RoutineSummary): string {
  const parts = [describeEnabled(routine.enabled)]
  if (routine.cronExpression) {
    parts.push(cronToHuman(routine.cronExpression, { utc: true }))
  }
  if (routine.repoUrls.length > 0) {
    parts.push(routine.repoUrls[0]!)
  }
  return parts.join(' · ')
}

async function requestScheduledRoutinesApi(
  signal: AbortSignal,
  action: 'list' | 'run',
  triggerId?: string,
): Promise<unknown> {
  const session = await getAuthRuntime().resolveSession({ allowRefresh: true })
  const routineSession = resolveScheduledRoutineApiSession(session)
  if ('error' in routineSession) {
    throw new Error(routineSession.error)
  }

  const base = buildNoumenaPlatformUrl('/v1/code/triggers')
  const headers = {
    Authorization: `Bearer ${routineSession.accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': TRIGGERS_BETA,
    'x-organization-uuid': routineSession.organizationUuid,
  }

  const res = await axios.request({
    method: action === 'list' ? 'GET' : 'POST',
    url:
      action === 'list'
        ? base
        : `${base}/${encodeURIComponent(triggerId ?? '')}/run`,
    headers,
    data: action === 'run' ? {} : undefined,
    timeout: 20_000,
    signal,
    validateStatus: () => true,
  })

  if (res.status >= 400) {
    const detail =
      typeof res.data === 'string'
        ? res.data
        : previewText(jsonStringify(res.data), 400)
    throw new Error(
      `Remote routine API returned HTTP ${res.status}${detail ? `: ${detail}` : ''}`,
    )
  }

  return res.data
}

function buildInputGuide(isListView: boolean): React.ReactNode {
  return (
    <Text dimColor italic>
      <Byline>
        <KeyboardShortcutHint shortcut="Enter" action="select" />
        <ConfigurableShortcutHint
          action="confirm:no"
          context="Confirmation"
          fallback="Esc"
          description={isListView ? 'close' : 'back'}
        />
      </Byline>
    </Text>
  )
}

function RoutineDetail({
  routine,
}: {
  routine: RoutineSummary
}): React.ReactNode {
  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{routine.name}</Text>
      <Text>Schedule: {routine.cronExpression ? cronToHuman(routine.cronExpression, { utc: true }) : 'Unknown'}</Text>
      {routine.cronExpression ? (
        <Text dimColor>UTC cron: {routine.cronExpression}</Text>
      ) : null}
      <Text>Status: {describeEnabled(routine.enabled)}</Text>
      <Text>Next run: {formatTimestamp(routine.nextRunAt)}</Text>
      {routine.triggerCount > 1 ? (
        <Text>Triggers: {routine.triggerCount}</Text>
      ) : null}
      {routine.environmentId ? (
        <Text>Environment: {routine.environmentId}</Text>
      ) : null}
      {routine.model ? <Text>Model: {routine.model}</Text> : null}
      {routine.repoUrls.length > 0 ? (
        <Box flexDirection="column">
          <Text>Repositories:</Text>
          {routine.repoUrls.map(url => (
            <Text key={url} dimColor>
              {url}
            </Text>
          ))}
        </Box>
      ) : null}
      {routine.promptPreview ? (
        <Box flexDirection="column">
          <Text>Prompt preview:</Text>
          <Text dimColor>{routine.promptPreview}</Text>
        </Box>
      ) : null}
      {routine.mcpConnectionCount > 0 ? (
        <Text>MCP connections: {routine.mcpConnectionCount}</Text>
      ) : null}
      <Text dimColor>{ROUTINES_PAGE_HINT}</Text>
    </Box>
  )
}

function AgentsPlatformDialog({ onDone, context }: Props): React.ReactNode {
  const [loadingState, setLoadingState] = useState<'loading' | 'running' | null>(
    'loading',
  )
  const [routines, setRoutines] = useState<RoutineSummary[]>([])
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'detail'>('list')

  const selectedRoutine =
    routines.find(routine => routine.id === selectedRoutineId) ?? null

  const refreshRoutines = useCallback(async () => {
    setLoadingState('loading')
    setError(null)
    try {
      const payload = await requestScheduledRoutinesApi(
        context.abortController.signal,
        'list',
      )
      const nextRoutines = extractRoutineRecords(payload).map(summarizeRoutine)
      setRoutines(nextRoutines)
      setSelectedRoutineId(prev => {
        if (prev && nextRoutines.some(routine => routine.id === prev)) {
          return prev
        }
        return nextRoutines[0]?.id ?? null
      })
    } catch (error) {
      const message = toError(error).message
      logError(error)
      setError(message)
    } finally {
      setLoadingState(null)
    }
  }, [context.abortController.signal])

  useEffect(() => {
    void refreshRoutines()
  }, [refreshRoutines])

  const listOptions = useMemo<OptionWithDescription<string>[]>(() => {
    const routineOptions = routines.map(routine => ({
      value: `open:${routine.id}`,
      label: routine.name,
      description: listDescription(routine),
    }))
    return [
      ...routineOptions,
      {
        value: 'refresh',
        label: 'Refresh list',
        description: 'Re-fetch routines from the cloud account',
      },
    ]
  }, [routines])

  const detailOptions = useMemo<OptionWithDescription<string>[]>(() => {
    if (!selectedRoutine) {
      return [
        {
          value: 'back',
          label: 'Back',
        },
      ]
    }

    return [
      {
        value: 'run',
        label: 'Run now',
        description: 'Start a new routine run immediately',
      },
      {
        value: 'refresh',
        label: 'Refresh details',
        description: 'Re-fetch routines from the cloud account',
      },
      {
        value: 'back',
        label: 'Back to routine list',
      },
    ]
  }, [selectedRoutine])

  const handleListAction = useCallback(
    async (value: string) => {
      if (value === 'refresh') {
        await refreshRoutines()
        return
      }
      if (!value.startsWith('open:')) {
        return
      }
      setNotice(null)
      setError(null)
      setSelectedRoutineId(value.slice('open:'.length))
      setView('detail')
    },
    [refreshRoutines],
  )

  const handleDetailAction = useCallback(
    async (value: string) => {
      if (value === 'back') {
        setView('list')
        return
      }
      if (value === 'refresh') {
        await refreshRoutines()
        return
      }
      if (value !== 'run' || !selectedRoutine) {
        return
      }
      if (!selectedRoutine.scheduleTriggerId) {
        setError(
          'This routine does not expose a runnable schedule trigger in the current source build.',
        )
        return
      }

      setLoadingState('running')
      setError(null)
      setNotice(null)
      try {
        await requestScheduledRoutinesApi(
          context.abortController.signal,
          'run',
          selectedRoutine.scheduleTriggerId,
        )
        setNotice(`Started routine run for ${selectedRoutine.name}.`)
      } catch (error) {
        const message = toError(error).message
        logError(error)
        setError(message)
      } finally {
        setLoadingState(null)
      }
    },
    [context.abortController.signal, refreshRoutines, selectedRoutine],
  )

  if (loadingState === 'loading') {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onDone} hideInputGuide>
        <LoadingState message="Loading routines…" />
      </Dialog>
    )
  }

  if (loadingState === 'running') {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={() => setView('detail')} hideInputGuide>
        <LoadingState message="Starting routine run…" />
      </Dialog>
    )
  }

  if (error && routines.length === 0) {
    return (
      <Dialog
        title={DIALOG_TITLE}
        subtitle="Unable to load routines"
        onCancel={onDone}
        inputGuide={() => buildInputGuide(true)}
      >
        <Box flexDirection="column" gap={1}>
          <Text color="error">{error}</Text>
          <Select
            options={[
              {
                value: 'refresh',
                label: 'Retry',
                description: 'Try loading routines again',
              },
            ]}
            onChange={value => void handleListAction(value)}
            onCancel={onDone}
          />
        </Box>
      </Dialog>
    )
  }

  if (view === 'detail' && selectedRoutine) {
    return (
      <Dialog
        title={DIALOG_TITLE}
        subtitle={getRoutineSubtitle(selectedRoutine)}
        onCancel={() => setView('list')}
        inputGuide={() => buildInputGuide(false)}
        color="background"
      >
        <Box flexDirection="column" gap={1}>
          {notice ? <Text color="success">{notice}</Text> : null}
          {error ? <Text color="error">{error}</Text> : null}
          <RoutineDetail routine={selectedRoutine} />
          <Select
            options={detailOptions}
            onChange={value => void handleDetailAction(value)}
            onCancel={() => setView('list')}
          />
        </Box>
      </Dialog>
    )
  }

  const subtitle =
    routines.length > 0
      ? 'Schedules are shown in your local time zone. API and GitHub triggers are managed on the web.'
      : 'No routines found. Manage them in the Noumena web app.'

  return (
    <Dialog
      title={DIALOG_TITLE}
      subtitle={subtitle}
      onCancel={onDone}
      inputGuide={() => buildInputGuide(true)}
      color="background"
    >
      <Box flexDirection="column" gap={1}>
        {notice ? <Text color="success">{notice}</Text> : null}
        {error ? <Text color="error">{error}</Text> : null}
        {routines.length === 0 ? (
          <Text dimColor>No routines are visible to this account.</Text>
        ) : null}
        <Select
          options={listOptions}
          onChange={value => void handleListAction(value)}
          onCancel={onDone}
          visibleOptionCount={10}
          layout="compact-vertical"
        />
      </Box>
    </Dialog>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  return <AgentsPlatformDialog onDone={onDone} context={context} />
}
