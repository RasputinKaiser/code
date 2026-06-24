import audioCaptureArm64Darwin from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/arm64-darwin/audio-capture.node' with { type: 'file' }
import audioCaptureArm64Linux from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/arm64-linux/audio-capture.node' with { type: 'file' }
import audioCaptureArm64Win32 from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/arm64-win32/audio-capture.node' with { type: 'file' }
import audioCaptureX64Darwin from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/x64-darwin/audio-capture.node' with { type: 'file' }
import audioCaptureX64Linux from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/x64-linux/audio-capture.node' with { type: 'file' }
import audioCaptureX64Win32 from '../../../node_modules/@anthropic-ai/claude-agent-sdk/vendor/audio-capture/x64-win32/audio-capture.node' with { type: 'file' }

export function getEmbeddedAudioCapturePath(): string | null {
  switch (`${process.arch}-${process.platform}`) {
    case 'arm64-darwin':
      return audioCaptureArm64Darwin
    case 'arm64-linux':
      return audioCaptureArm64Linux
    case 'arm64-win32':
      return audioCaptureArm64Win32
    case 'x64-darwin':
      return audioCaptureX64Darwin
    case 'x64-linux':
      return audioCaptureX64Linux
    case 'x64-win32':
      return audioCaptureX64Win32
    default:
      return null
  }
}
