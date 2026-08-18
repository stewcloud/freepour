export type GamePlugin = {
  id: string; name: string; description: string; minPlayers: number; maxPlayers: number;
  defaultDurationSeconds: number; defaultConfig: Record<string, unknown>; status: 'placeholder' | 'playable';
};
export const gameCatalog: GamePlugin[] = [
  { id: 'quick-draw', name: 'Quick Draw', description: 'React fastest after the signal.', minPlayers: 2, maxPlayers: 100, defaultDurationSeconds: 45, defaultConfig: { falseStartPenalty: true }, status: 'placeholder' },
  { id: 'perfect-pour', name: 'Perfect Pour', description: 'Stop the pour at the perfect line.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 60, defaultConfig: { targetPercent: 100 }, status: 'placeholder' },
  { id: 'higher-or-lower', name: 'Higher or Lower', description: 'Predict the next card.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 90, defaultConfig: { rounds: 7 }, status: 'placeholder' },
  { id: 'trivia', name: 'Trivia', description: 'Venue-wide timed questions.', minPlayers: 1, maxPlayers: 500, defaultDurationSeconds: 180, defaultConfig: { questionCount: 5 }, status: 'placeholder' },
  { id: 'plinko', name: 'Plinko', description: 'Drop a puck for points or prizes.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 60, defaultConfig: { rows: 8 }, status: 'placeholder' }
];
export const getGame = (id: string) => gameCatalog.find((game) => game.id === id);

