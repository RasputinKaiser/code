import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'src/ink.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import {
  WELCOME_ASCII_ANIMATION_COMPACT,
  WELCOME_ASCII_ANIMATION_FPS,
  WELCOME_ASCII_ANIMATION_MEDIUM,
} from './noumenaWelcomeFrames.js';

export function WelcomeV2() {
  const { columns } = useTerminalSize();
  const animation = useMemo(
    () =>
      columns >= WELCOME_ASCII_ANIMATION_MEDIUM.width + 4
        ? WELCOME_ASCII_ANIMATION_MEDIUM
        : WELCOME_ASCII_ANIMATION_COMPACT,
    [columns],
  );
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    setFrameIndex(0);
  }, [animation]);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex(current => (current + 1) % animation.frames.length);
    }, Math.round(1000 / WELCOME_ASCII_ANIMATION_FPS));
    return () => clearInterval(timer);
  }, [animation]);

  const frame = animation.frames[frameIndex]!.split('\n');

  return (
    <Box width={animation.width} flexDirection="column">
      <Text>
        <Text color="#DC95FF">Welcome to Code </Text>
        <Text dimColor={true}>v{MACRO.VERSION}</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        {frame.map((line, index) => (
          <Text key={`${frameIndex}-${index}`} color="#DC95FF">{line}</Text>
        ))}
      </Box>
    </Box>
  );
}
