import { cwd } from 'node:process'
import { getMcpSkillCommands } from '../src/commands.js'
import {
  setCwdState,
  setInlinePlugins,
  setIsInteractive,
  setOriginalCwd,
  setProjectRoot,
} from '../src/bootstrap/state.js'
import { initBuiltinPlugins } from '../src/plugins/bundled/index.js'
import { getBuiltinPluginSkillCommands } from '../src/plugins/builtinPlugins.js'
import {
  getConditionalSkillCount,
  getDynamicSkills,
  getSkillDirCommands,
} from '../src/skills/loadSkillsDir.js'
import { enableConfigs } from '../src/utils/config.js'
import {
  getPluginCommands,
  getPluginSkills,
} from '../src/utils/plugins/loadPluginCommands.js'

function readHidden(cmd: any): string {
  try {
    return String(Boolean(cmd.isHidden))
  } catch {
    return 'error'
  }
}

function readEnabled(cmd: any): string {
  try {
    if (typeof cmd.isEnabled !== 'function') return ''
    return String(Boolean(cmd.isEnabled()))
  } catch {
    return 'error'
  }
}

function serializeCommand(cmd: any) {
  return {
    name: cmd.name ?? '',
    type: cmd.type ?? '',
    source: cmd.source ?? '',
    loadedFrom: cmd.loadedFrom ?? '',
    aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
    availability: Array.isArray(cmd.availability) ? cmd.availability : [],
    hidden: readHidden(cmd),
    enabledNow: readEnabled(cmd),
    disableModelInvocation: String(Boolean(cmd.disableModelInvocation)),
    userInvocable:
      cmd.userInvocable === undefined ? '' : String(Boolean(cmd.userInvocable)),
  }
}

async function readChromeAutoEnableProbe() {
  try {
    const module = await import('../src/utils/claudeInChrome/setup.js')
    return {
      status: 'ok',
      value: Boolean(module.shouldAutoEnableClaudeInChrome()),
      error: '',
    }
  } catch (error) {
    return {
      status: 'error',
      value: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const projectCwd = cwd()
setOriginalCwd(projectCwd)
setProjectRoot(projectCwd)
setCwdState(projectCwd)
setIsInteractive(true)
setInlinePlugins([])
enableConfigs()

initBuiltinPlugins()

const chromeAutoEnableProbe = await readChromeAutoEnableProbe()

const [
  skillDirCommands,
  pluginCommands,
  pluginSkills,
] = await Promise.all([
  getSkillDirCommands(projectCwd),
  getPluginCommands(),
  getPluginSkills(),
])

const builtinPluginSkills = getBuiltinPluginSkillCommands()
const dynamicSkills = getDynamicSkills()
const conditionalSkillCount = getConditionalSkillCount()
const mcpSkillCommands = getMcpSkillCommands([])

const result = {
  cwd: projectCwd,
  shouldAutoEnableClaudeInChrome: chromeAutoEnableProbe.value,
  shouldAutoEnableClaudeInChromeStatus: chromeAutoEnableProbe.status,
  shouldAutoEnableClaudeInChromeError: chromeAutoEnableProbe.error,
  buckets: {
    builtinPluginSkills: builtinPluginSkills.map(serializeCommand),
    skillDirCommands: skillDirCommands.map(serializeCommand),
    pluginCommands: pluginCommands.map(serializeCommand),
    pluginSkills: pluginSkills.map(serializeCommand),
    dynamicSkills: dynamicSkills.map(serializeCommand),
    mcpSkillCommandsFromEmptyState: mcpSkillCommands.map(serializeCommand),
  },
  counts: {
    builtinPluginSkills: builtinPluginSkills.length,
    skillDirCommands: skillDirCommands.length,
    pluginCommands: pluginCommands.length,
    pluginSkills: pluginSkills.length,
    dynamicSkills: dynamicSkills.length,
    pendingConditionalSkills: conditionalSkillCount,
    mcpSkillCommandsFromEmptyState: mcpSkillCommands.length,
  },
}

console.log(JSON.stringify(result, null, 2))
