export type GamePlugin = {
  id: string; name: string; description: string; minPlayers: number; maxPlayers: number;
  defaultDurationSeconds: number; defaultConfig: Record<string, unknown>; status: 'placeholder' | 'playable';
};
export const gameCatalog: GamePlugin[] = [
  { id: 'quick-draw', name: 'Quick Draw', description: 'React fastest after the signal.', minPlayers: 2, maxPlayers: 100, defaultDurationSeconds: 12, defaultConfig: { falseStartPenalty: true }, status: 'playable' },
  { id: 'perfect-pour', name: 'Perfect Pour', description: 'Stop the pour at the perfect line.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 15, defaultConfig: { targetPercent: 100 }, status: 'playable' },
  { id: 'higher-or-lower', name: 'Higher or Lower', description: 'Predict the next card.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 15, defaultConfig: { rounds: 7 }, status: 'playable' },
  { id: 'trivia', name: 'Trivia', description: 'Venue-wide timed questions.', minPlayers: 1, maxPlayers: 500, defaultDurationSeconds: 18, defaultConfig: { questionCount: 4 }, status: 'playable' },
  { id: 'plinko', name: 'Plinko', description: 'Drop a puck for points.', minPlayers: 1, maxPlayers: 100, defaultDurationSeconds: 15, defaultConfig: { rows: 6 }, status: 'playable' }
];
export const getGame = (id: string) => gameCatalog.find((game) => game.id === id);
