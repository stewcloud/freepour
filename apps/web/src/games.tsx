import React,{useEffect,useState} from 'react';
import { getGame, scoreGame } from '@freepour/games';
export type GamePhase='play'|'reveal'|'round-winner'|'ad';
export type RoundState={roundId:string;sessionId?:string;categoryId:string;categoryName:string;gameNumber:number;gameCount:number;gameId:string;phase:GamePhase;startedAt:number;actionAt:number;endsAt:number;payload:Record<string,any>};
export type GameResult={roundId:string;gameId:string;playerId:string;username:string;action:string;value?:number|string;score:number;receivedAt?:number};
export const trivia=[
 {question:'Which planet is known as the Red Planet?',answers:['Venus','Mars','Jupiter','Mercury'],correct:1},
 {question:'How many sides does a standard stop sign have?',answers:['Six','Seven','Eight','Nine'],correct:2},
 {question:'Which ocean is the largest?',answers:['Atlantic','Indian','Arctic','Pacific'],correct:3},
 {question:'What is the capital of Canada?',answers:['Toronto','Ottawa','Vancouver','Montreal'],correct:1},
 {question:'Which element has the symbol Au?',answers:['Silver','Gold','Argon','Copper'],correct:1},
 {question:'In computing, what does CPU stand for?',answers:['Core Power Unit','Central Processing Unit','Computer Personal Utility','Central Program User'],correct:1},
 {question:'Which year did humans first land on the Moon?',answers:['1965','1967','1969','1971'],correct:2}
];
const suits=['♥','♦','♣','♠']; const card=(seed:number)=>({rank:2+(Math.abs(seed)%12),suit:suits[Math.abs(seed*7)%4]});
export function createRound(gameId:string,sequence:number,categoryId='skill',categoryName='Skill & Timing',gameNumber=1,gameCount=3):RoundState{
 const now=Date.now(),game=getGame(gameId)!,roundId=`${gameId}-${now}-${sequence}`; let payload:Record<string,any>={}; let actionAt=now;
 if(gameId==='quick-draw')actionAt=now+3200+((sequence*977)%2200);
 if(gameId==='higher-or-lower'){const current=card(now+sequence),next=card(now+sequence+19);payload={current,next:next.rank===current.rank?{...next,rank:next.rank===13?12:next.rank+1}:next};}
 if(gameId==='trivia')payload=trivia[sequence%trivia.length];
 if(gameId==='plinko')payload={slots:[100,250,500,1000,500,250,100]};
 return{roundId,categoryId,categoryName,gameNumber,gameCount,gameId,phase:'play',startedAt:now,actionAt,endsAt:now+game.defaultDurationSeconds*1000,payload};
}
export const scoreInput=(state:RoundState,input:Omit<GameResult,'score'>)=>scoreGame(state,input);
const cardName=(rank:number)=>rank===11?'J':rank===12?'Q':rank===13?'K':String(rank);
const PlayingCard=({value,hidden=false}:{value:{rank:number,suit:string},hidden?:boolean})=><div className={`playing-card ${hidden?'card-back':''}`}><span>{hidden?'FREEPOUR':cardName(value.rank)}</span>{!hidden&&<i className={value.suit==='♥'||value.suit==='♦'?'red':''}>{value.suit}</i>}</div>;
export function VenueGameStage({state,results,roundLeaders=[]}:{state:RoundState;results:GameResult[];roundLeaders?:{username:string;score:number}[]}){
 const[now,setNow]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(t)},[]);const remaining=Math.max(0,Math.ceil((state.endsAt-now)/1000));const leaders=[...results].sort((a,b)=>b.score-a.score).slice(0,5);const reveal=state.phase==='reveal';let visual:React.ReactNode;
 if(state.gameId==='quick-draw')visual=<div className={`draw-signal ${now>=state.actionAt?'go':''}`}>{reveal?'RESULTS':now>=state.actionAt?'DRAW!':'WAIT…'}</div>;
 else if(state.gameId==='perfect-pour'){const best=leaders[0];visual=<div className={`pour-visual ${best?.value===100?'perfect':''}`}><div className="glass"><div className="beer" style={reveal&&best?{height:`${Math.min(100,Number(best.value))}%`}:undefined}/></div><strong>{reveal?(Number(best?.value)>100?'BUST':Number(best?.value)===100?'PERFECT POUR!':`${Number(best?.value??0).toFixed(2)}%`):'STOP AT 100.00%'}</strong></div>}
 else if(state.gameId==='higher-or-lower')visual=<div className="card-showdown"><PlayingCard value={state.payload.current}/><b>→</b><div className={reveal?'card-flip revealed':'card-flip'}><PlayingCard value={state.payload.next} hidden={!reveal}/></div>{reveal&&<strong>{state.payload.next.rank>state.payload.current.rank?'HIGHER!':'LOWER!'}</strong>}</div>;
 else if(state.gameId==='trivia')visual=<div className="trivia-visual"><p className="question-count">QUESTION {state.gameNumber} OF {state.gameCount}</p><h2>{state.payload.question}</h2><div>{state.payload.answers.map((a:string,i:number)=><span className={reveal&&i===state.payload.correct?'correct-answer':''} key={a}>{String.fromCharCode(65+i)} · {a}</span>)}</div></div>;
 else {const drop=leaders[0]?Number(leaders[0].value):3;const selected=Number(state.payload.outcomes?.[drop]??drop);visual=<div className={`plinko-wrap ${reveal?'dropping':''}`}><div className="puck" style={{'--slot':selected} as React.CSSProperties}/><div className="plinko-board">{Array.from({length:8},(_,r)=><div key={r}>{Array.from({length:r+4},(_,p)=><i key={p}/>)}</div>)}{state.payload.slots.map((v:number,i:number)=><b key={i}>{v}</b>)}</div>{reveal&&<strong>LANDED FOR {state.payload.slots[selected]}!</strong>}</div>}
 const shown=state.phase==='round-winner'?roundLeaders:leaders;
 return <div className={`live-game game-${state.gameId} phase-${state.phase}`}><div className="round-meta"><span>{state.categoryName}</span><b>{state.gameNumber}/{state.gameCount}</b></div>{state.phase==='play'&&<div className="round-timer">{remaining}</div>}<div className="game-visual">{visual}</div><div className="leaderboard"><p className="eyebrow">{state.phase==='round-winner'?'ROUND WINNER':reveal?'REVEAL':'LIVE SCORES'}</p>{shown.length?shown.map((r:any,i:number)=><div key={r.playerId??r.username}><span>{i+1}</span><strong>{r.username}</strong><b>{r.score}</b></div>):<p>Waiting for players…</p>}</div></div>;
}
export function PlayerGameControl({state,onSubmit}:{state:RoundState;onSubmit:(action:string,value?:number|string)=>void}){
 const[sub,setSub]=useState(false),[now,setNow]=useState(Date.now()),[pouring,setPouring]=useState(false),[pour,setPour]=useState(0);useEffect(()=>{setSub(false);setPour(0);setPouring(false)},[state.roundId]);useEffect(()=>{const t=setInterval(()=>{setNow(Date.now());if(pouring)setPour(v=>Math.min(120,v+.625))},50);return()=>clearInterval(t)},[pouring]);const remaining=Math.max(0,Math.ceil((state.endsAt-now)/1000));const submit=(a:string,v?:number|string)=>{if(sub||state.phase!=='play')return;setSub(true);setPouring(false);onSubmit(a,v)};
 if(state.phase!=='play'||sub)return <div className="player-game submitted"><span>✓</span><h2>{state.phase==='play'?'Locked in!':'Watch the reveal!'}</h2><p>Your phone will update automatically for the next game.</p></div>;
 if(state.gameId==='quick-draw')return <div className="player-game"><p className="eyebrow">QUICK DRAW · {remaining}</p><h2>{now>=state.actionAt?'GO!':'Wait for it…'}</h2><button className={`mega-button ${now>=state.actionAt?'ready':''}`} onClick={()=>submit('tap')}>TAP</button></div>;
 if(state.gameId==='perfect-pour')return <div className="player-game"><p className="eyebrow">PERFECT POUR · {remaining}</p><h2>Hold, then release</h2><div className="phone-glass"><div style={{height:`${Math.min(100,pour)}%`}}/></div><button className="mega-button" onPointerDown={()=>setPouring(true)} onPointerUp={()=>submit('pour',Number(pour.toFixed(2)))} onPointerLeave={()=>pouring&&submit('pour',Number(pour.toFixed(2)))}>HOLD</button></div>;
 if(state.gameId==='higher-or-lower')return <div className="player-game"><p className="eyebrow">HIGHER OR LOWER · {remaining}</p><PlayingCard value={state.payload.current}/><div className="choice-grid"><button onClick={()=>submit('higher')}>↑ Higher</button><button onClick={()=>submit('lower')}>↓ Lower</button></div></div>;
 if(state.gameId==='trivia')return <div className="player-game"><p className="eyebrow">QUESTION {state.gameNumber}/{state.gameCount} · {remaining}</p><h2>{state.payload.question}</h2><div className="answer-grid">{state.payload.answers.map((a:string,i:number)=><button key={a} onClick={()=>submit('answer',i)}><span>{String.fromCharCode(65+i)}</span>{a}</button>)}</div></div>;
 return <div className="player-game"><p className="eyebrow">PLINKO · {remaining}</p><h2>Choose your drop</h2><div className="drop-grid">{Array.from({length:7},(_,i)=><button key={i} onClick={()=>submit('drop',i)}>{i+1}</button>)}</div></div>;
}
