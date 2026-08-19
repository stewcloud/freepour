# FreePour game roadmap

Every game must be understandable from across a venue, playable with one hand, authoritative on the server, and end with a clear reveal.

## Next: Guess the Emoji

The TV presents an emoji clue such as `🦁 👑`; players type a short answer such as “The Lion King.” Answers are normalized by lowercasing, removing punctuation/articles, collapsing whitespace, and comparing against curated aliases. A conservative fuzzy match may accept minor spelling errors, but must not accept a different title merely because it shares one word. Each clue stores canonical answers, aliases, category, difficulty, and an explanation shown during reveal.

Scoring combines correctness and response time. Exact/alias matches receive full credit; reviewed fuzzy matches receive slightly reduced credit. The reveal shows the canonical title, clue explanation, and per-player thumbs-up/down status. Content needs an admin editor and a test suite of accepted and rejected guesses.

## Party-style mini-games

Build short, social games that evoke the pace and spectacle of couch-party games without copying protected characters, art, music, names, boards, or individual game designs.

Initial candidates:

- Crowd Balance: tilt a shared platform by choosing left/right at the right moment.
- Pattern Panic: repeat an accelerating color/rhythm sequence.
- Safe Step: choose a lane while hazards are revealed one beat at a time.
- Team Tug: alternate taps in rhythm; mistimed taps drain momentum.
- Hot Potato: pass before an unpredictable timer expires.
- Target Dash: stop a moving marker inside shrinking target zones.

Each candidate needs a deterministic server seed, spectator-readable animation, latency-tolerant input rules, accessibility alternatives, and a 30–60 second total runtime.

## Horse Race

Players tap to the rhythm of their assigned horse. The server sends a beat map and judges taps within timing windows. Perfect and good hits add speed; misses and repeated spam add no movement. Momentum eases between beats so one early lead is not permanent.

The TV displays all horses on a side-scrolling track with player names, position changes, a finish-line camera, and final podium. Phones show a large tap area, beat pulse, combo, and timing feedback. The server remains authoritative by timestamping input, applying a bounded latency allowance, and broadcasting normalized progress.

Suggested scoring:

- Perfect hit: 100 timing points and full acceleration
- Good hit: 60 timing points and partial acceleration
- Miss: no acceleration and combo reset
- Sustained combo: small capped momentum bonus
- Winner: first authoritative progress value to cross the finish distance

## Delivery order

1. Guess the Emoji engine, answer normalization, content model, and admin editor.
2. Horse Race timing engine and two-player prototype, then scale testing.
3. Shared party-game primitives: beat maps, deterministic seeds, lanes, teams, physics playback, and replay payloads.
4. Release two original party-style games using those primitives.

