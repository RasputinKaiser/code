import { beforeEach, describe, expect, it, mock } from 'bun:test'

const clearJsCalls: Array<{ toolName: string }> = []
const clearPyCalls: Array<{ toolName: string }> = []

const jsFactoryPaths = [
  import.meta.resolve('./javascriptReplFactory.tsx'),
  import.meta.resolve('./javascriptReplFactory.js'),
]
const pyFactoryPaths = [
  import.meta.resolve('./pyReplFactory.ts'),
  import.meta.resolve('./pyReplFactory.js'),
]

for (const jsFactoryPath of jsFactoryPaths) {
  mock.module(jsFactoryPath, () => ({
    clearJavascriptReplContext(
      _toolUseContext: unknown,
      toolName: string,
    ) {
      clearJsCalls.push({ toolName })
    },
  }))
}

for (const pyFactoryPath of pyFactoryPaths) {
  mock.module(pyFactoryPath, () => ({
    clearPythonReplContext: async (
      _toolUseContext: unknown,
      toolName: string,
    ) => {
      clearPyCalls.push({ toolName })
    },
  }))
}

const { JSReplResetTool } = await import(
  import.meta.resolve('./JSReplResetTool.tsx'),
)
const { PyReplResetTool } = await import(
  import.meta.resolve('./PyReplResetTool.tsx'),
)

beforeEach(() => {
  clearJsCalls.length = 0
  clearPyCalls.length = 0
})

describe('REPL reset tools runtime contract', () => {
  it('resets the js_repl kernel context', async () => {
    const result = await JSReplResetTool.call!({} as never, {} as never)

    expect(result.data).toEqual({ reset: true })
    expect(clearJsCalls).toEqual([{ toolName: 'js_repl' }])
  })

  it('resets the py_repl kernel context', async () => {
    const result = await PyReplResetTool.call!({} as never, {} as never)

    expect(result.data).toEqual({ reset: true })
    expect(clearPyCalls).toEqual([{ toolName: 'py_repl' }])
  })
})
