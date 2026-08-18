import React, { useEffect, useMemo, useState } from 'react';

export type RoundState = { roundId: string; gameId: string; startedAt: number; actionAt: number; endsAt: number; payload: Record<string, any> };
export type GameResult = { roundId: string; gameId: string; playerId: string; username: string; action: string; value?: number | string; score: number; receivedAt?: number };

const trivia = [
  { question: 'Which spirit is the base of a classic mojito?', answers: ['Gin', 'Rum', 'Tequila', 'Vodka'], correct: 1 },
  { question: 'What does “neat” mean?', answers: ['No ice', 'Extra ice', 'With soda', 'Blended'], correct: 0 },
  { question: 'Which cocktail traditionally includes bitters and a sugar cube?', answers: ['Paloma', 'Old Fashioned', 'Daiquiri', 'French 75'], correct: 1 },
  { question: 'A standard wine bottle contains how many milliliters?', answers: ['500', '650', '750', '1000'], correct: 2 }
];

export function createRound(gameId: string, sequence: number): RoundState {
  const now = Date.now(); const roundId = `${gameId}-${now}`;
  if (gameId === 'quick-draw') return { roundId, gameId, startedAt: now, actionAt: now + 4000 + Math.floor(Math.random() * 2500), endsAt: now + 12000, payload: {} };
  if (gameId === 'higher-or-lower') { const current = 2 + Math.floor(Math.random() * 12); let next = 2 + Math.floor(Math.random() * 12); if (next === current) next = next === 13 ? 12 : next + 1; return { roundId, gameId, startedAt: now, actionAt: now, endsAt: now + 15000, payload: { current, next } }; }
  if (gameId === 'trivia') return { roundId, gameId, startedAt: now, actionAt: now, endsAt: now + 18000, payload: trivia[sequence % trivia.length] };
  return { roundId, gameId, startedAt: now, actionAt: now, endsAt: now + 15000, payload: {} };
}

export function scoreInput(state: RoundState, input: Omit<GameResult, 'score'>): number {
  if (state.gameId === 'quick-draw') return input.receivedAt! < state.actionAt ? 0 : Math.max(0, 1000 - (input.receivedAt! - state.actionAt));
  if (state.gameId === 'perfect-pour') return Math.max(0, Math.round(1000 - Math.abs(Number(input.value) - 100) * 40));
  if (state.gameId === 'higher-or-lower') { const correct = state.payload.next > state.payload.current ? 'higher' : 'lower'; return input.action === correct ? 1000 : 0; }
  if (state.gameId === 'trivia') return Number(input.value) === state.payload.correct ? 1000 : 0;
  if (state.gameId === 'plinko') { const slots = [100, 250, 500, 1000, 500, 250, 100]; return slots[Math.abs(Number(input.value)) % slots.length]; }
  return 0;
}

const cardName = (value: number) => value === 11 ? 'J' : value === 12 ? 'Q' : value === 13 ? 'K' : String(value);

export function VenueGameStage({ state, results }: { state: RoundState; results: GameResult[] }) {
  const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000)); const leaders = [...results].sort((a, b) => b.score - a.score).slice(0, 5);
  let visual: React.ReactNode;
  if (state.gameId === 'quick-draw') visual = <div className={`draw-signal ${now >= state.actionAt ? 'go' : ''}`}>{now >= state.actionAt ? 'TAP!' : 'WAIT…'}</div>;
  else if (state.gameId === 'perfect-pour') visual = <div className="pour-visual"><div className="glass"><div className="beer" /></div><strong>STOP AT THE LINE</strong></div>;
  else if (state.gameId === 'higher-or-lower') visual = <div className="card-visual"><div className="playing-card">{cardName(state.payload.current)}</div><strong>Higher or lower?</strong></div>;
  else if (state.gameId === 'trivia') visual = <div className="trivia-visual"><h2>{state.payload.question}</h2><div>{state.payload.answers.map((answer: string, i: number) => <span key={answer}>{String.fromCharCode(65 + i)} · {answer}</span>)}</div></div>;
  else visual = <div className="plinko-board">{Array.from({ length: 6 }, (_, row) => <div key={row}>{Array.from({ length: row + 4 }, (_, peg) => <i key={peg} />)}</div>)}<b>100</b><b>250</b><b>500</b><b>1000</b><b>500</b><b>250</b><b>100</b></div>;
  return <div className={`live-game game-${state.gameId}`}><div className="round-timer">{remaining}</div><div className="game-visual">{visual}</div><div className="leaderboard"><p className="eyebrow">LIVE SCORES</p>{leaders.length ? leaders.map((result, i) => <div key={result.playerId}><span>{i + 1}</span><strong>{result.username}</strong><b>{result.score}</b></div>) : <p>Waiting for players…</p>}</div></div>;
}

export function PlayerGameControl({ state, onSubmit }: { state: RoundState; onSubmit: (action: string, value?: number | string) => void }) {
  const [submitted, setSubmitted] = useState(false); const [now, setNow] = useState(Date.now()); const [pouring, setPouring] = useState(false); const [pour, setPour] = useState(0);
  useEffect(() => { setSubmitted(false); setPour(0); setPouring(false); }, [state.roundId]);
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); if (pouring) setPour(v => Math.min(125, v + 1.5)); }, 50); return () => clearInterval(timer); }, [pouring]);
  const remaining = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const submit = (action: string, value?: number | string) => { if (submitted) return; setSubmitted(true); setPouring(false); onSubmit(action, value); };
  if (submitted) return <div className="player-game submitted"><span>✓</span><h2>Locked in!</h2><p>Watch the TV for results.</p></div>;
  if (state.gameId === 'quick-draw') return <div className="player-game"><p className="eyebrow">QUICK DRAW · {remaining}</p><h2>{now >= state.actionAt ? 'GO!' : 'Wait for it…'}</h2><button className={`mega-button ${now >= state.actionAt ? 'ready' : ''}`} onClick={() => submit('tap')} disabled={now < state.startedAt}>TAP</button></div>;
  if (state.gameId === 'perfect-pour') return <div className="player-game"><p className="eyebrow">PERFECT POUR · {remaining}</p><h2>Hold to pour</h2><div className="phone-glass"><div style={{ height: `${Math.min(100, pour)}%` }} /></div><button className="mega-button" onPointerDown={() => setPouring(true)} onPointerUp={() => submit('pour', pour)} onPointerCancel={() => setPouring(false)}>HOLD</button></div>;
  if (state.gameId === 'higher-or-lower') return <div className="player-game"><p className="eyebrow">HIGHER OR LOWER · {remaining}</p><div className="phone-card">{cardName(state.payload.current)}</div><div className="choice-grid"><button onClick={() => submit('higher')}>↑ Higher</button><button onClick={() => submit('lower')}>↓ Lower</button></div></div>;
  if (state.gameId === 'trivia') return <div className="player-game"><p className="eyebrow">TRIVIA · {remaining}</p><h2>{state.payload.question}</h2><div className="answer-grid">{state.payload.answers.map((answer: string, i: number) => <button key={answer} onClick={() => submit('answer', i)}><span>{String.fromCharCode(65 + i)}</span>{answer}</button>)}</div></div>;
  return <div className="player-game"><p className="eyebrow">PLINKO · {remaining}</p><h2>Choose your drop</h2><div className="drop-grid">{Array.from({ length: 7 }, (_, i) => <button key={i} onClick={() => submit('drop', i)}>{i + 1}</button>)}</div></div>;
}
