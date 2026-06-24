import * as React from 'react';
import { Box, Text } from '../../ink.js';

export type SpherePose = 'default' | 'arms-up' | 'look-left' | 'look-right';

type Props = {
  pose?: SpherePose;
};

export const HEADER_MARK_WIDTH = 16;
export const HEADER_MARK_HEIGHT = 5;

const HEADER_MARK = [
  '⠀⠀⠀⠀⠀⣠⡴⠖⠒⠦⣄⠀⠀⠀⠀⠀',
  '⠀⠀⠀⢀⣾⣿⠀⠀⠀⠀⠈⢳⡀⠀⠀⠀',
  '⠀⠀⠀⢸⡿⠿⣆⠀⠀⠀⠀⢈⡇⠀⠀⠀',
  '⠀⠀⠀⠈⢧⡀⠈⢳⣦⣤⣤⡾⠁⠀⠀⠀',
  '⠀⠀⠀⠀⠀⠙⠲⠾⠿⠟⠋⠀⠀⠀⠀⠀',
] as const;

export function Sphere(_props: Props) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      {HEADER_MARK.map((line, index) => (
        <Text key={index} color="#DC95FF">
          {line}
        </Text>
      ))}
    </Box>
  );
}
