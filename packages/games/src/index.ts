export type GameCategoryId = 'trivia' | 'skill' | 'carnival';
export type GamePlugin = { id: string; name: string; description: string; categoryId: GameCategoryId; minPlayers: number; maxPlayers: number; defaultDurationSeconds: number; revealSeconds: number; defaultConfig: Record<string, unknown>; status: 'placeholder' | 'playable' };
export type ScoringInput = { action: string; value?: number | string; receivedAt?: number };
export type ScoringState = { gameId: string; actionAt?: number; payload: Record<string, any> };
export const categories = [
  { id: 'trivia' as const, name: 'Trivia', description: 'Five-question knowledge rounds', defaultGameCount: 5 },
  { id: 'skill' as const, name: 'Skill & Timing', description: 'Hands-on phone challenges', defaultGameCount: 3 },
  { id: 'carnival' as const, name: 'Luck & Carnival', description: 'Big-screen suspense games', defaultGameCount: 3 }
];
export const gameCatalog: GamePlugin[] = [
  { id: 'quick-draw', name: 'Quick Draw', categoryId: 'skill', description: 'React fastest after the signal.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 10, revealSeconds: 6, defaultConfig: { falseStartPenalty: true }, status: 'playable' },
  { id: 'perfect-pour', name: 'Perfect Pour', categoryId: 'skill', description: 'Stop at exactly 100.00% without going over.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 12, revealSeconds: 7, defaultConfig: { targetPercent: 100, speed: 12.5 }, status: 'playable' },
  { id: 'higher-or-lower', name: 'Higher or Lower', categoryId: 'carnival', description: 'Predict the next real playing card.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 11, revealSeconds: 7, defaultConfig: {}, status: 'playable' },
  { id: 'trivia', name: 'Trivia', categoryId: 'trivia', description: 'Venue-wide timed questions.', minPlayers: 1, maxPlayers: 500, defaultDurationSeconds: 14, revealSeconds: 6, defaultConfig: { questionCount: 5 }, status: 'playable' },
  { id: 'plinko', name: 'Plinko', categoryId: 'carnival', description: 'Choose a drop and watch a deterministic puck fall.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 10, revealSeconds: 8, defaultConfig: { rows: 8 }, status: 'playable' }
];
export const getGame = (id: string) => gameCatalog.find(game => game.id === id);
export function scoreGame(state: ScoringState, input: ScoringInput): number {
  if (state.gameId === 'quick-draw') return !input.receivedAt || input.receivedAt < Number(state.actionAt) ? 0 : Math.max(0, 1000 - (input.receivedAt - Number(state.actionAt)));
  if (state.gameId === 'perfect-pour') { const value = Number(input.value),target=Number(state.payload.targetPercent??100); return value > target || value < 0 ? 0 : Math.round((value/target)*1000); }
  if (state.gameId === 'higher-or-lower') { const correct = state.payload.next.rank > state.payload.current.rank ? 'higher' : 'lower'; return input.action === correct ? 1000 : 0; }
  if (state.gameId === 'trivia') return Number(input.value) === state.payload.correct ? 1000 : 0;
  if (state.gameId === 'plinko') { const drop=Number(input.value),slot=Number(state.payload.outcomes?.[drop]??drop); return Number(state.payload.slots?.[slot] ?? 0); }
  return 0;
}
export function seededUnit(seed: number) { let x = seed | 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }
export function plinkoPath(seed: number, rows = 8) { return Array.from({ length: rows }, (_, row) => seededUnit(seed + row * 7919) < .5 ? -1 : 1); }
export function chooseWeighted<T extends { weight: number }>(items: T[], seed: number): T | undefined { const active = items.filter(item => item.weight > 0); const total = active.reduce((sum, item) => sum + item.weight, 0); if (!total) return; let cursor = seededUnit(seed) * total; for (const item of active) { cursor -= item.weight; if (cursor < 0) return item; } return active.at(-1); }
