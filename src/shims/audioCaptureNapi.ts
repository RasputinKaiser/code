import { createRequire } from 'node:module'
import { getEmbeddedAudioCapturePath } from './assets/audioCapture.js'

const requireFn = createRequire(import.meta.url)

type NativeAudioBinding = {
  startRecording?: (...args: unknown[]) => boolean
  stopRecording?: () => void
  isRecording?: () => boolean
  startPlayback?: (...args: unknown[]) => boolean
  writePlaybackData?: (chunk: Buffer | Uint8Array) => void
  stopPlayback?: () => void
  isPlaying?: () => boolean
  microphoneAuthorizationStatus?: () => number
}

let cachedBinding: NativeAudioBinding | null | undefined

function loadNativeBinding(): NativeAudioBinding | null {
  if (cachedBinding !== undefined) {
    return cachedBinding
  }

  const embeddedPath = getEmbeddedAudioCapturePath()
  if (!embeddedPath) {
    cachedBinding = null
    return cachedBinding
  }

  try {
    cachedBinding = requireFn(embeddedPath) as NativeAudioBinding
  } catch {
    cachedBinding = null
  }

  return cachedBinding
}

export function isNativeAudioAvailable(): boolean {
  return loadNativeBinding() !== null
}

export function startRecording(...args: unknown[]): boolean {
  const binding = loadNativeBinding()
  return binding?.startRecording?.(...args) ?? false
}

export function stopRecording(): void {
  loadNativeBinding()?.stopRecording?.()
}

export function isRecording(): boolean {
  return loadNativeBinding()?.isRecording?.() ?? false
}

export function startPlayback(...args: unknown[]): boolean {
  const binding = loadNativeBinding()
  return binding?.startPlayback?.(...args) ?? false
}

export function writePlaybackData(chunk: Buffer | Uint8Array): void {
  loadNativeBinding()?.writePlaybackData?.(chunk)
}

export function stopPlayback(): void {
  loadNativeBinding()?.stopPlayback?.()
}

export function isPlaying(): boolean {
  return loadNativeBinding()?.isPlaying?.() ?? false
}

export function microphoneAuthorizationStatus(): number {
  return loadNativeBinding()?.microphoneAuthorizationStatus?.() ?? 0
}

export default {
  isNativeAudioAvailable,
  startRecording,
  stopRecording,
  isRecording,
  startPlayback,
  writePlaybackData,
  stopPlayback,
  isPlaying,
  microphoneAuthorizationStatus,
}
