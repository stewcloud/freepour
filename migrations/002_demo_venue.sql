insert into venues (name, slug)
values ('FreePour Demo', 'demo')
on conflict (slug) do nothing;

insert into venue_games (venue_id, game_id, enabled, rotation_position)
select v.id, game.id, true, game.position
from venues v
cross join (values
  ('quick-draw', 0),
  ('perfect-pour', 1),
  ('higher-or-lower', 2),
  ('trivia', 3),
  ('plinko', 4)
) as game(id, position)
where v.slug = 'demo'
on conflict (venue_id, game_id) do nothing;
