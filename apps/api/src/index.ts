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
import { gameCatalog } from '@freepour/games';

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

type Claims = { sub: string; role: 'platform_admin' | 'venue_admin'; venueId?: string };
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
  const result = await pool.query('select id, email, password_hash, role, venue_id from users where lower(email)=lower($1) and active=true', [input.data.email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.data.password, user.password_hash))) return res.status(401).json({ error: 'invalid_credentials' });
  const token = jwt.sign({ sub: user.id, role: user.role, venueId: user.venue_id }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { email: user.email, role: user.role, venueId: user.venue_id } });
});

app.get('/api/admin/venues', auth, platformAdmin, async (_req, res) => {
  const result = await pool.query(`select v.id,v.name,v.slug,v.timezone,v.active,v.prizes_enabled,v.created_at,
    (select count(*)::int from player_sessions ps where ps.venue_id=v.id) as player_count,
    coalesce((select json_agg(json_build_object('gameId',vg.game_id,'enabled',vg.enabled,'position',vg.rotation_position,'config',vg.config)
      order by vg.rotation_position) from venue_games vg where vg.venue_id=v.id),'[]') games
    from venues v order by v.created_at desc`);
  res.json(result.rows);
});

app.post('/api/admin/venues', auth, platformAdmin, async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().min(2).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    timezone: z.string().trim().min(3).max(80).default('America/Los_Angeles')
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_venue', details: input.error.flatten() });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const created = await client.query('insert into venues(name,slug,timezone) values($1,$2,$3) returning *', [input.data.name, input.data.slug, input.data.timezone]);
    for (const [position, game] of gameCatalog.entries()) {
      await client.query('insert into venue_games(venue_id,game_id,enabled,rotation_position,config) values($1,$2,true,$3,$4)', [created.rows[0].id, game.id, position, game.defaultConfig]);
    }
    await client.query('commit');
    res.status(201).json(created.rows[0]);
  } catch (error: any) {
    await client.query('rollback');
    if (error?.code === '23505') return res.status(409).json({ error: 'slug_in_use' });
    throw error;
  } finally { client.release(); }
});

app.put('/api/admin/venues/:venueId', auth, platformAdmin, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(80), timezone: z.string().trim().min(3).max(80), active: z.boolean() }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'invalid_venue' });
  const updated = await pool.query('update venues set name=$1,timezone=$2,active=$3,updated_at=now() where id=$4 returning *', [input.data.name, input.data.timezone, input.data.active, req.params.venueId]);
  if (!updated.rows[0]) return res.status(404).json({ error: 'venue_not_found' });
  res.json(updated.rows[0]);
});

app.get('/api/venues/:slug/config', async (req, res) => {
  const result = await pool.query(`select v.id, v.name, v.slug, v.timezone, v.prizes_enabled,
    coalesce(json_agg(json_build_object('gameId', vg.game_id, 'enabled', vg.enabled, 'position', vg.rotation_position, 'config', vg.config)
      order by vg.rotation_position) filter (where vg.game_id is not null), '[]') games
    from venues v left join venue_games vg on vg.venue_id=v.id where v.slug=$1 and v.active=true group by v.id`, [req.params.slug]);
  if (!result.rows[0]) return res.status(404).json({ error: 'venue_not_found' });
  res.json(result.rows[0]);
});

app.put('/api/venues/:venueId/games', auth, async (req, res) => {
  const claims = res.locals.user as Claims;
  if (claims.role !== 'platform_admin' && claims.venueId !== req.params.venueId) return res.status(403).json({ error: 'forbidden' });
  const input = z.array(z.object({ gameId: z.string(), enabled: z.boolean(), position: z.number().int().min(0), config: z.record(z.string(), z.unknown()).default({}) })).parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const item of input) await client.query(`insert into venue_games(venue_id,game_id,enabled,rotation_position,config) values($1,$2,$3,$4,$5)
      on conflict(venue_id,game_id) do update set enabled=$3,rotation_position=$4,config=$5,updated_at=now()`, [req.params.venueId, item.gameId, item.enabled, item.position, item.config]);
    await client.query('commit');
    io.to(`venue:${req.params.venueId}`).emit('venue:config-updated');
    res.status(204).end();
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
});

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
  socket.join(`venue:${venueId}`);
  if (socket.handshake.auth?.screenKey) {
    socket.join(`screen:${venueId}`);
    await redis.hSet(`screen:${venueId}`, { socketId: socket.id, lastSeenAt: new Date().toISOString(), status: 'online' });
    await redis.expire(`screen:${venueId}`, 45);
    io.to(`venue:${venueId}`).emit('screen:status', { status: 'online' });
  }
  socket.on('screen:heartbeat', async (payload = {}) => {
    await redis.hSet(`screen:${venueId}`, { socketId: socket.id, lastSeenAt: new Date().toISOString(), status: 'online', currentGame: String(payload.currentGame ?? '') });
    await redis.expire(`screen:${venueId}`, 45);
  });
  socket.on('game:input', (payload) => io.to(`screen:${venueId}`).emit('game:input', { ...payload, receivedAt: Date.now() }));
  socket.on('disconnect', () => io.to(`venue:${venueId}`).emit('screen:status', { status: 'offline' }));
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error); res.status(500).json({ error: 'internal_error' });
});
server.listen(port, () => console.log(`FreePour API listening on ${port}`));
