import type { MoodKind } from './models'

// Shared by reload normalization and companion writes; new choices must survive reloads.
export const moodKinds: MoodKind[] = [
  'happy', 'satisfied', 'hopeful', 'grateful', 'lighthearted', 'relaxed',
  'calm', 'secure', 'lost', 'uneasy', 'empty', 'tired',
  'lonely', 'sad', 'wronged', 'anxious', 'irritated', 'angry',
]
