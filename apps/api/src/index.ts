import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { Server } from 'socket.io';
import { z } from 'zod';
import { categories, gameCatalog, plinkoPath, scoreGame } from '@freepour/games';

const port = Number(process.env.API_PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', (error) => console.error('Redis error', error));
await redis.connect();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

type Claims = { sub: string; role: 'platform_admin' | 'venue_admin'; venueId?: string; accountId?: string; accountRole?: 'owner'|'admin'|'viewer' };
const auth: express.RequestHandler = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  try { res.locals.user = jwt.verify(token ?? '', jwtSecret) as Claims; next(); }
  catch { res.status(401).json({ error: 'unauthorized' }); }
};
const platformAdmin: express.RequestHandler = (req, res, next) => {
  const claims = res.locals.user as Claims;
  if (claims.role !== 'platform_admin') return res.status(403).json({ error: 'platform_admin_required' });
  next();
};

app.get('/health', async (_req, res) => {
  const db = await pool.query('select now() as now');
  res.json({ ok: true, brand: process.env.APP_NAME ?? 'FreePour', database: db.rows[0].now, redis: redis.isReady });
});
app.get('/api/games', (_req, res) => res.json(gameCatalog));

app.get('/api/setup/status', async (_req, res) => {
  const result = await pool.query('select exists(select 1 from users where active=true) as configured');
  res.json({ configured: result.rows[0].configured });
});

app.post('/api/setup/bootstrap', async (req, res) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(12).max(128) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_setup', details: input.error.flatten() });
  const existing = await pool.query('select exists(select 1 from users) as configured');
  if (existing.rows[0].configured) return res.status(409).json({ error: 'already_configured' });
  const passwordHash = await bcrypt.hash(input.data.password, 12);
  const created = await pool.query(`insert into users(email,password_hash,role) values($1,$2,'platform_admin') returning id,email,role`, [input.data.email, passwordHash]);
  const user = created.rows[0];
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '12h' });
  res.status(201).json({ token, user });
});

app.post('/api/auth/login', async (req, res) => {
  const input = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_credentials' });
  const result = await pool.query(`select u.id,u.email,u.password_hash,u.role,u.venue_id,am.account_id,am.role account_role from users u left join account_memberships am on am.user_id=u.id where lower(u.email)=lower($1) and u.active=true order by case when am.role='owner' then 0 else 1 end limit 1`, [input.data.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.data.password, user.password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
  const token = jwt.sign({ sub: user.id, role: user.role, venueId: user.venue_id, accountId:user.account_id, accountRole:user.account_role }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { email: user.email, role: user.role, venueId: user.venue_id, accountId:user.account_id, accountRole:user.account_role } });
});

app.get('/api/platform/accounts',auth,platformAdmin,async(_req,res)=>{const result=await pool.query(`select a.*,count(v.id) filter(where v.active)::int active_venues,count(v.id)::int total_venues,coalesce(json_agg(json_build_object('id',v.id,'name',v.name,'slug',v.slug,'active',v.active) order by v.created_at) filter(where v.id is not null),'[]') venues from accounts a left join venues v on v.account_id=a.id group by a.id order by a.created_at desc`);res.json(result.rows)});
app.post('/api/platform/accounts',auth,platformAdmin,async(req,res)=>{const input=z.object({name:z.string().trim().min(2).max(100),billingEmail:z.string().email(),venueLimit:z.number().int().min(1).max(1000),ownerEmail:z.string().email(),ownerPassword:z.string().min(12).max(128)}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'invalid_account',details:input.error.flatten()});const client=await pool.connect();try{await client.query('begin');const account=(await client.query(`insert into accounts(name,billing_email,status,subscription_status,venue_limit) values($1,$2,'active','trial',$3) returning *`,[input.data.name,input.data.billingEmail,input.data.venueLimit])).rows[0];const passwordHash=await bcrypt.hash(input.data.ownerPassword,12);const owner=(await client.query(`insert into users(email,password_hash,role) values($1,$2,'venue_admin') returning id,email`,[input.data.ownerEmail,passwordHash])).rows[0];await client.query(`insert into account_memberships(account_id,user_id,role) values($1,$2,'owner')`,[account.id,owner.id]);await client.query(`insert into audit_events(actor_user_id,account_id,action,metadata) values($1,$2,'account.created',$3)`,[(res.locals.user as Claims).sub,account.id,{venueLimit:account.venue_limit,ownerEmail:owner.email}]);await client.query('commit');res.status(201).json({...account,ownerEmail:owner.email})}catch(error:any){await client.query('rollback');if(error?.code==='23505')return res.status(409).json({error:'email_or_billing_id_in_use'});throw error}finally{client.release()}});
app.patch('/api/platform/accounts/:accountId',auth,platformAdmin,async(req,res)=>{const input=z.object({name:z.string().trim().min(2).max(100).optional(),status:z.enum(['trial','active','past_due','suspended','cancelled']).optional(),subscriptionStatus:z.enum(['trial','active','past_due','cancelled']).optional(),venueLimit:z.number().int().min(1).max(1000).optional()}).safeParse(req.body);if(!input.success)return res.status(400).json({error:'invalid_account'});const current=(await pool.query('select * from accounts where id=$1',[req.params.accountId])).rows[0];if(!current)return res.status(404).json({error:'account_not_found'});const next={name:input.data.name??current.name,status:input.data.status??current.status,subscriptionStatus:input.data.subscriptionStatus??current.subscription_status,venueLimit:input.data.venueLimit??current.venue_limit};const active=(await pool.query('select count(*)::int count from venues where account_id=$1 and active',[req.params.accountId])).rows[0].count;if(next.venueLimit<active)return res.status(409).json({error:'venue_limit_below_active_count',activeVenues:active});const updated=(await pool.query('update accounts set name=$1,status=$2,subscription_status=$3,venue_limit=$4,updated_at=now() where id=$5 returning *',[next.name,next.status,next.subscriptionStatus,next.venueLimit,req.params.accountId])).rows[0];await pool.query(`insert into audit_events(actor_user_id,account_id,action,metadata) values($1,$2,'account.updated',$3)`,[(res.locals.user as Claims).sub,req.params.accountId,input.data]);res.json(updated)});

app.get('/api/admin/account',auth,async(_req,res)=>{const claims=res.locals.user as Claims;if(!claims.accountId)return res.status(403).json({error:'account_membership_required'});const result=await pool.query(`select a.*,count(v.id) filter(where v.active)::int active_venues,count(v.id)::int total_venues from accounts a left join venues v on v.account_id=a.id where a.id=$1 group by a.id`,[claims.accountId]);res.json(result.rows[0])});

app.get('/api/admin/venues', auth, async (_req, res) => {
  const claims=res.locals.user as Claims,accountId=claims.role==='platform_admin'?null:claims.accountId;
  if(claims.role!=='platform_admin'&&!accountId)return res.status(403).json({error:'account_membership_required'});
  const result = await pool.query(`select v.id,v.name,v.slug,v.timezone,v.active,v.prizes_enabled,v.created_at,
    (select count(*)::int from player_sessions ps where ps.venue_id=v.id) as player_count,
    coalesce((select json_agg(json_build_object('gameId',vg.game_id,'enabled',vg.enabled,'position',vg.rotation_position,'config',vg.config,'weight',vg.weight) order by vg.rotation_position) from venue_games vg where vg.venue_id=v.id),'[]') games,
    coalesce((select json_agg(json_build_object('categoryId',vc.category_id,'enabled',vc.enabled,'position',vc.rotation_position,'gameCount',vc.game_count,'weight',vc.weight) order by vc.rotation_position) from venue_categories vc where vc.venue_id=v.id),'[]') categories
    from venues v where ($1::uuid is null or v.account_id=$1) order by v.created_at desc`,[accountId??null]);
  res.json(result.rows);
});

app.post('/api/admin/venues', auth, async (req, res) => {
  const claims=res.locals.user as Claims;
  if(claims.role!=='platform_admin'&&!['owner','admin'].includes(claims.accountRole??''))return res.status(403).json({error:'account_admin_required'});
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    timezone: z.string().trim().min(3).max(80).default('America/Los_Angeles'),
    accountId: z.string().uuid().optional()
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_venue', details: input.error.flatten() });
  const accountId=claims.role==='platform_admin'?input.data.accountId:claims.accountId;
  if(!accountId)return res.status(403).json({error:'account_membership_required'});
  const capacity=(await pool.query(`select a.status,a.venue_limit,count(v.id) filter(where v.active)::int active_venues from accounts a left join venues v on v.account_id=a.id where a.id=$1 group by a.id`,[accountId])).rows[0];
  if(!capacity)return res.status(404).json({error:'account_not_found'});
  if(!['trial','active'].includes(capacity.status))return res.status(403).json({error:'account_not_active'});
  if(capacity.active_venues>=capacity.venue_limit)return res.status(409).json({error:'venue_limit_reached',venueLimit:capacity.venue_limit});
  const client = await pool.connect();
  try {
    await client.query('begin');
    const created = await client.query('insert into venues(account_id,name,slug,timezone) values($1,$2,$3,$4) returning *', [accountId,input.data.name,input.data.slug,input.data.timezone]);
    for (const [position, game] of gameCatalog.entries()) {
      await client.query('insert into venue_games(venue_id,game_id,enabled,rotation_position,config,weight) values($1,$2,true,$3,$4,1)', [created.rows[0].id, game.id, position, game.defaultConfig]);
    }
    for (const [position, category] of categories.entries()) await client.query('insert into venue_categories(venue_id,category_id,rotation_position,game_count) values($1,$2,$3,$4)', [created.rows[0].id, category.id, position, category.defaultGameCount]);
    await client.query(`insert into audit_events(actor_user_id,account_id,venue_id,action) values($1,$2,$3,'venue.created')`,[claims.sub,accountId,created.rows[0].id]);
    await client.query('commit');
    res.status(201).json(created.rows[0]);
  } catch (error: any) {
    await client.query('rollback');
    if (error?.code === '23505') return res.status(409).json({ error: 'slug_in_use' });
    throw error;
  } finally { client.release(); }
});

app.delete('/api/admin/venues/:venueId', auth, async (req, res) => {
  const claims=res.locals.user as Claims;
  if(claims.role!=='platform_admin'&&!['owner','admin'].includes(claims.accountRole??''))return res.status(403).json({error:'account_admin_required'});
  const venue=await pool.query('select id,slug from venues where id=$1 and ($2::boolean or account_id=$3)',[req.params.venueId,claims.role==='platform_admin',claims.accountId??null]);
  if(!venue.rows[0])return res.status(404).json({error:'venue_not_found'});
  if(venue.rows[0].slug==='demo')return res.status(409).json({error:'demo_venue_protected'});
  const deleted=await pool.query('delete from venues where id=$1 returning id,name,account_id',[req.params.venueId]);
  if(!deleted.rows[0])return res.status(404).json({error:'venue_not_found'});
  await redis.del(`screen:${req.params.venueId}`);
  res.json({deleted:true,venue:deleted.rows[0]});
});

app.put('/api/admin/venues/:venueId', auth, async (req, res) => {
  const claims=res.locals.user as Claims;
  if(claims.role!=='platform_admin'&&!['owner','admin'].includes(claims.accountRole??''))return res.status(403).json({error:'account_admin_required'});
  const input = z.object({ name: z.string().trim().min(2).max(80), timezone: z.string().trim().min(3).max(80), active: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_venue' });
  const updated = await pool.query('update venues set name=$1,timezone=$2,active=$3,updated_at=now() where id=$4 and ($5::boolean or account_id=$6) returning *', [input.data.name, input.data.timezone, input.data.active, req.params.venueId,claims.role==='platform_admin',claims.accountId??null]);
  if (!updated.rows[0]) return res.status(404).json({ error: 'venue_not_found' });
  res.json(updated.rows[0]);
});

app.get('/api/venues/:slug/config', async (req, res) => {
  const result = await pool.query(`select v.id, v.name, v.slug, v.timezone, v.prizes_enabled,
    coalesce(json_agg(json_build_object('gameId', vg.game_id, 'enabled', vg.enabled, 'position', vg.rotation_position, 'config', vg.config, 'weight',vg.weight)
      order by vg.rotation_position) filter (where vg.game_id is not null), '[]') games,
    coalesce((select json_agg(json_build_object('categoryId',vc.category_id,'enabled',vc.enabled,'position',vc.rotation_position,'gameCount',vc.game_count,'weight',vc.weight) order by vc.rotation_position) from venue_categories vc where vc.venue_id=v.id),'[]') categories,
    coalesce((select json_agg(json_build_object('name',c.name,'message',cc.asset_url,'durationSeconds',cc.duration_seconds) order by c.weight desc) from campaigns c join campaign_creatives cc on cc.campaign_id=c.id where (c.venue_id=v.id or c.venue_id is null) and c.status='active' and cc.active=true and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())),'[]') ads
    from venues v left join venue_games vg on vg.venue_id=v.id where v.slug=$1 and v.active=true group by v.id`, [req.params.slug]);
  if (!result.rows[0]) return res.status(404).json({ error: 'venue_not_found' });
  res.json(result.rows[0]);
});

app.put('/api/venues/:venueId/games', auth, async (req, res) => {
  const claims = res.locals.user as Claims;
  if(claims.role!=='platform_admin'&&!['owner','admin'].includes(claims.accountRole??''))return res.status(403).json({error:'account_admin_required'});
  const allowed=claims.role==='platform_admin'||Boolean((await pool.query('select 1 from venues where id=$1 and account_id=$2',[req.params.venueId,claims.accountId??null])).rowCount);
  if(!allowed)return res.status(403).json({error:'forbidden'});
  const input = z.array(z.object({ gameId: z.string(), enabled: z.boolean(), position: z.number().int().min(0), weight: z.number().int().min(1).max(10).default(1), config: z.record(z.string(), z.unknown()).default({}) })).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const item of input) await client.query(`insert into venue_games(venue_id,game_id,enabled,rotation_position,config,weight) values($1,$2,$3,$4,$5,$6)
      on conflict(venue_id,game_id) do update set enabled=$3,rotation_position=$4,config=$5,weight=$6,updated_at=now()`, [req.params.venueId, item.gameId, item.enabled, item.position, item.config, item.weight]);
    await client.query('commit');
    io.to(`venue:${req.params.venueId}`).emit('venue:config-updated');
    res.status(204).end();
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
});

app.put('/api/venues/:venueId/categories', auth, async (req, res) => {
  const claims=res.locals.user as Claims;if(claims.role!=='platform_admin'&&!['owner','admin'].includes(claims.accountRole??''))return res.status(403).json({error:'account_admin_required'});const allowed=claims.role==='platform_admin'||Boolean((await pool.query('select 1 from venues where id=$1 and account_id=$2',[req.params.venueId,claims.accountId??null])).rowCount);if(!allowed)return res.status(403).json({error:'forbidden'});
  const input=z.array(z.object({categoryId:z.enum(['trivia','skill','carnival']),enabled:z.boolean(),position:z.number().int().min(0),gameCount:z.number().int().min(1).max(20),weight:z.number().int().min(1).max(10)})).parse(req.body);
  for(const item of input) await pool.query(`insert into venue_categories(venue_id,category_id,enabled,rotation_position,game_count,weight) values($1,$2,$3,$4,$5,$6) on conflict(venue_id,category_id) do update set enabled=$3,rotation_position=$4,game_count=$5,weight=$6`,[req.params.venueId,item.categoryId,item.enabled,item.position,item.gameCount,item.weight]);
  io.to(`venue:${req.params.venueId}`).emit('venue:config-updated'); res.status(204).end();
});

app.get('/api/venues/:slug/leaderboard', async (req,res)=>{ const result=await pool.query(`select coalesce(ge.username,ps.username) username,sum(ge.score)::int score,count(*)::int games from game_entries ge join game_sessions gs on gs.id=ge.game_session_id join venues v on v.id=gs.venue_id left join player_sessions ps on ps.id=ge.player_session_id where v.slug=$1 and gs.created_at>=date_trunc('day',now() at time zone v.timezone) at time zone v.timezone group by coalesce(ge.username,ps.username) order by score desc limit 10`,[req.params.slug]); res.json(result.rows); });

app.get('/api/admin/venues/:venueId/screen',auth,async(req,res)=>{const claims=res.locals.user as Claims,allowed=claims.role==='platform_admin'||Boolean((await pool.query('select 1 from venues where id=$1 and account_id=$2',[req.params.venueId,claims.accountId??null])).rowCount);if(!allowed)return res.status(403).json({error:'forbidden'});const data=await redis.hGetAll(`screen:${req.params.venueId}`);res.json({status:Object.keys(data).length?'online':'offline',...data})});

app.post('/api/player/session', async (req, res) => {
  const input = z.object({ venueSlug: z.string(), username: z.string().trim().min(2).max(24).regex(/^[\w -]+$/) }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_player' });
  const venue = await pool.query('select id from venues where slug=$1 and active=true', [input.data.venueSlug]);
  if (!venue.rows[0]) return res.status(404).json({ error: 'venue_not_found' });
  const player = await pool.query('insert into player_sessions(venue_id,username) values($1,$2) returning id,venue_id,username,created_at', [venue.rows[0].id, input.data.username]);
  res.status(201).json(player.rows[0]);
});

io.use((socket, next) => {
  const venueId = socket.handshake.auth?.venueId;
  if (typeof venueId !== 'string') return next(new Error('venueId required'));
  socket.data.venueId = venueId; next();
});
io.on('connection', async (socket) => {
  const venueId = socket.data.venueId as string;
  const venueRecord = await pool.query('select id from venues where id::text=$1 or slug=$1', [venueId]);
  const venueDbId = venueRecord.rows[0]?.id as string | undefined;
  socket.join(`venue:${venueId}`);
  if (socket.handshake.auth?.screenKey) {
    socket.data.isScreen = true;
    socket.join(`screen:${venueId}`);
    await redis.hSet(`screen:${venueId}`, { socketId: socket.id, lastSeenAt: new Date().toISOString(), status: 'online' });
    await redis.expire(`screen:${venueId}`, 45);
    io.to(`venue:${venueId}`).emit('screen:status', { status: 'online' });
  } else {
    const activeRound = await redis.get(`round:${venueId}`);
    if (activeRound) socket.emit('game:state', JSON.parse(activeRound));
  }
  socket.on('screen:heartbeat', async (payload = {}) => {
    const heartbeat={ socketId: socket.id, lastSeenAt: new Date().toISOString(), status: 'online', currentGame: String(payload.currentGame ?? ''), phase:String(payload.phase??'') };
    await redis.hSet(`screen:${venueId}`, heartbeat); await redis.expire(`screen:${venueId}`,45);
    if(venueDbId&&venueDbId!==venueId){await redis.hSet(`screen:${venueDbId}`,heartbeat);await redis.expire(`screen:${venueDbId}`,45);}
  });
  socket.on('game:state', async (payload) => {
    if (!socket.data.isScreen || !payload?.roundId || !payload?.gameId) return;
    const state={...payload,payload:{...payload.payload}};
    if(state.gameId==='plinko'&&!state.payload.path){const seed=Math.floor(Math.random()*2147483647);state.payload.seed=seed;state.payload.path=plinkoPath(seed,8);state.payload.outcomes=Array.from({length:7},(_,drop)=>Math.max(0,Math.min(6,drop+plinkoPath(seed+drop*101,8).reduce((sum:number,step:number)=>sum+step,0)/2)));}
    if(venueDbId&&state.phase==='play'){const created=await pool.query('insert into game_sessions(venue_id,game_id,category_id,state,starts_at,ends_at,phase) values($1,$2,$3,$4,to_timestamp($5/1000.0),to_timestamp($6/1000.0),$7) returning id',[venueDbId,state.gameId,state.categoryId??null,state,state.startedAt,state.endsAt,state.phase]);state.sessionId=created.rows[0].id;}
    await redis.set(`round:${venueId}`, JSON.stringify(state), { EX: 180 });
    io.to(`venue:${venueId}`).emit('game:state', state);
  });
  socket.on('game:input', async (payload) => { const raw=await redis.get(`round:${venueId}`); if(!raw)return; const state=JSON.parse(raw); if(state.phase!=='play'||payload.roundId!==state.roundId)return; const receivedAt=Date.now(); const score=scoreGame(state,{...payload,receivedAt}); const result={...payload,receivedAt,score}; if(state.sessionId&&payload.playerId){await pool.query(`insert into game_entries(game_session_id,player_session_id,username,score,payload) values($1,$2,$3,$4,$5) on conflict(game_session_id,player_session_id) do nothing`,[state.sessionId,payload.playerId,payload.username,score,payload]).catch(error=>console.error('Could not persist game entry',error));} io.to(`screen:${venueId}`).emit('game:input',result); socket.emit('game:accepted',{roundId:state.roundId,score}); });
  socket.on('disconnect', () => io.to(`venue:${venueId}`).emit('screen:status', { status: 'offline' }));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error); res.status(500).json({ error: 'internal_error' });
});
server.listen(port, () => console.log(`FreePour API listening on ${port}`));
