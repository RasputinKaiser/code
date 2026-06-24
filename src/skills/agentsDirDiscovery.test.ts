import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { clearSkillCaches, getSkillDirCommands } from './loadSkillsDir.js'

// Covers issue #23: .agents/skills discovery with explicit precedence and
// positive tests. Behavior is aligned to the Codex standard
// (codex-rs/core-skills/src/loader.rs) — .agents/skills is a cross-vendor
// compatibility surface, loaded as user-global $HOME/.agents/skills and as
// per-ancestor <dir>/.agents/skills. Asymmetry: only .agents/skills is
// loaded; .agents/commands and .agents/agents are intentionally NOT loaded
// because those directories carry vendor-specific behavior the cross-vendor
// .agents/ spec does not define.

describe('codex-aligned .agents/skills discovery', () => {
  let tempProjectDir: string
  let tempHomeDir: string
  let prevEnv: Record<string, string | undefined>

  beforeEach(async () => {
    tempProjectDir = await mkdtemp(join(tmpdir(), 'ncode-skills-project-'))
    tempHomeDir = await mkdtemp(join(tmpdir(), 'ncode-skills-home-'))
    prevEnv = {
      HOME: process.env.HOME,
      NCODE_CONFIG_DIR: process.env.NCODE_CONFIG_DIR,
      CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    }
    // On POSIX, `os.homedir()` reads $HOME. Pin to a temp home so the
    // user-global ~/.agents/skills assertion is hermetic.
    process.env.HOME = tempHomeDir
    process.env.NCODE_CONFIG_DIR = join(tempHomeDir, '.ncode')
    process.env.CLAUDE_CONFIG_DIR = join(tempHomeDir, '.claude')
    clearSkillCaches()
  })

  afterEach(async () => {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = v
      }
    }
    await rm(tempProjectDir, { recursive: true, force: true })
    await rm(tempHomeDir, { recursive: true, force: true })
    clearSkillCaches()
  })

  async function writeSkill(
    parent: string,
    name: string,
    description: string = `${name} skill`,
  ): Promise<void> {
    const skillDir = join(parent, name)
    await mkdir(skillDir, { recursive: true })
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\ndescription: ${description}\n---\n${description}\n`,
    )
  }

  it('discovers .agents/skills/<name>/SKILL.md end-to-end from the project walk', async () => {
    await mkdir(join(tempProjectDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(tempProjectDir, '.agents', 'skills'), 'cross-vendor-skill')

    const skills = await getSkillDirCommands(tempProjectDir)
    const names = skills.map(s => s.name)

    expect(names).toContain('cross-vendor-skill')
  })

  it('discovers $HOME/.agents/skills from the user-global walk', async () => {
    await mkdir(join(tempHomeDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(tempHomeDir, '.agents', 'skills'), 'home-installed-skill')

    const skills = await getSkillDirCommands(tempProjectDir)
    const names = skills.map(s => s.name)

    expect(names).toContain('home-installed-skill')
  })

  it('discovers .agents/skills at every ancestor of cwd up to the project root', async () => {
    // repo/
    //   .agents/skills/top-skill
    //   pkg/
    //     .agents/skills/mid-skill
    //     src/
    //       .agents/skills/deep-skill
    //       file.ts  <- this is where we run from
    await mkdir(join(tempProjectDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(tempProjectDir, '.agents', 'skills'), 'top-skill')
    const pkg = join(tempProjectDir, 'pkg')
    const src = join(pkg, 'src')
    await mkdir(join(pkg, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(pkg, '.agents', 'skills'), 'mid-skill')
    await mkdir(join(src, '.agents', 'skills'), { recursive: true })
    await writeSkill(join(src, '.agents', 'skills'), 'deep-skill')
    const srcFile = join(src, 'file.ts')
    await writeFile(srcFile, '// test\n')

    const skills = await getSkillDirCommands(src)
    const names = skills.map(s => s.name)

    expect(names).toContain('top-skill')
    expect(names).toContain('mid-skill')
    expect(names).toContain('deep-skill')
  })

  it('preserves codex-aligned path-only dedup when .ncode/skills and .agents/skills declare the same name', async () => {
    // Codex: dedupe is by file identity (realpath), not by name. Two distinct
    // files with the same name both load; no name-based dedup.
    await mkdir(join(tempProjectDir, '.ncode', 'skills'), { recursive: true })
    await writeSkill(
      join(tempProjectDir, '.ncode', 'skills'),
      'shared-name',
      'ncode variant',
    )
    await mkdir(join(tempProjectDir, '.agents', 'skills'), { recursive: true })
    await writeSkill(
      join(tempProjectDir, '.agents', 'skills'),
      'shared-name',
      'agents variant',
    )

    const skills = await getSkillDirCommands(tempProjectDir)
    const shared = skills.filter(s => s.name === 'shared-name')

    // Both source paths loaded with distinct skillRoots, proving path-only
    // dedup (realpath) rather than name dedup.
    expect(shared.length).toBe(2)
    const roots = shared.map(s => s.skillRoot).sort()
    expect(roots[0]).toBe(
      join(tempProjectDir, '.agents', 'skills', 'shared-name'),
    )
    expect(roots[1]).toBe(
      join(tempProjectDir, '.ncode', 'skills', 'shared-name'),
    )
  })

  it('does NOT discover .agents/commands or .agents/agents', async () => {
    await mkdir(join(tempProjectDir, '.agents', 'commands'), { recursive: true })
    await mkdir(join(tempProjectDir, '.agents', 'agents'), { recursive: true })
    await writeFile(
      join(tempProjectDir, '.agents', 'commands', 'should-not-load.md'),
      '---\ndescription: forbidden command\n---\nbody\n',
    )
    await writeFile(
      join(tempProjectDir, '.agents', 'agents', 'should-not-load.md'),
      '---\ndescription: forbidden agent\n---\nbody\n',
    )

    const skills = await getSkillDirCommands(tempProjectDir)
    const names = skills.map(s => s.name)

    expect(names).not.toContain('should-not-load')
    expect(names).not.toContain('forbidden')
  })
})