import { describe, expect, test } from 'bun:test'
import React from 'react'
import App from './App.js'

function makeFakeStdin(chunks: Array<string | null>) {
  return {
    isTTY: true,
    read() {
      return chunks.shift() ?? null
    },
  } as unknown as NodeJS.ReadStream
}

function makeProps(stdin: NodeJS.ReadStream, onStdinResume?: () => void) {
  return {
    children: null as React.ReactNode,
    stdin,
    stdout: { isTTY: true, write() {} } as unknown as NodeJS.WriteStream,
    stderr: { isTTY: true, write() {} } as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    onExit() {},
    terminalColumns: 80,
    terminalRows: 24,
    selection: {
      start: null,
      end: null,
      mode: 'char',
      isDragging: false,
    },
    onSelectionChange() {},
    onClickAt() {
      return false
    },
    onHoverAt() {},
    getHyperlinkAt() {
      return undefined
    },
    onOpenHyperlink() {},
    onMultiClick() {},
    onSelectionDrag() {},
    onStdinResume,
    onCursorDeclaration() {},
    dispatchKeyboardEvent() {},
  }
}

describe('App.handleReadable stdin-resume gap detection', () => {
  test('does not treat the first stdin chunk after startup as a resume gap', () => {
    let resumeCalls = 0
    const stdin = makeFakeStdin(['a', null])
    const app = new App(makeProps(stdin, () => {
      resumeCalls += 1
    }))

    app.processInput = () => {}
    app.lastStdinTime = Date.now() - 6_000
    app.hasSeenStdinChunk = false

    app.handleReadable()

    expect(resumeCalls).toBe(0)
    expect(app.hasSeenStdinChunk).toBe(true)
  })

  test('still reasserts terminal modes after a real long stdin gap once input has flowed', () => {
    let resumeCalls = 0
    const stdin = makeFakeStdin(['a', null])
    const app = new App(makeProps(stdin, () => {
      resumeCalls += 1
    }))

    app.processInput = () => {}
    app.lastStdinTime = Date.now() - 6_000
    app.hasSeenStdinChunk = true

    app.handleReadable()

    expect(resumeCalls).toBe(1)
    expect(app.hasSeenStdinChunk).toBe(true)
  })
})
