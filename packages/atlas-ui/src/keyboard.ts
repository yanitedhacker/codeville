export type CanvasCommand =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'zoom'; factor: number }
  | { kind: 'reset' }

export function canvasCommand(key: string): CanvasCommand | null {
  switch (key) {
    case 'ArrowLeft':
      return { kind: 'pan', x: 48, y: 0 }
    case 'ArrowRight':
      return { kind: 'pan', x: -48, y: 0 }
    case 'ArrowUp':
      return { kind: 'pan', x: 0, y: 48 }
    case 'ArrowDown':
      return { kind: 'pan', x: 0, y: -48 }
    case '+':
      return { kind: 'zoom', factor: 1.2 }
    case '-':
      return { kind: 'zoom', factor: 1 / 1.2 }
    case '0':
      return { kind: 'reset' }
    case 'Escape':
      return null
    default:
      return null
  }
}

export function startsFlowing(prefersReducedMotion: boolean): boolean {
  return !prefersReducedMotion
}
