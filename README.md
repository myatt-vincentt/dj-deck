# DJ Deck

Two turntables and a mixer on a DJ booth in a recording studio, played with your hands. Both
decks play loops made in code, always in time: scratch a record and it follows you, forwards and
back; slide the crossfader between the decks, sweep the filter, fire the pads and drop the beat.
Two gold ghost hands play with you, the meters, speakers and LEDs pulse with the kick, and at
night club beams fall on the decks. Your camera sits small in the top right corner.

- **Start:** the home page shows while the studio and the booth load; Start turns the sound on
  and asks for the camera. Without a camera the studio opens anyway and you play with the mouse
  and keys.
- **The music:** four styles (House 124, Hip-hop 90, Disco 116, Lo-fi 80), four bars each.
  Deck A (teal) plays the music, deck B (magenta) the beat; a new style starts on the next bar.
- **Right hand, the deck:** swish your open palm side to side to scratch deck B; when your hand
  stops, the record drops back on the beat. Make a fist to brake it to a stop; open it to let go.
- **Left hand, the mixer:** across the picture is the crossfader (towards your left, deck A);
  up and down the filter (the middle is open, higher is high-pass, lower low-pass). It takes over
  after a moment in view; when it leaves, both glide back to the middle. Thin guides over your
  camera show where it is, and a small tag names what your hands just did.
- **Signs:** hold up 1, 2, 3 or 4 fingers (hand still) for the fill, the echo, the riser or a
  vocal chop. They land on the next beat.
- **The drop:** raise both open palms high, hold them a moment, then pull them down fast
  together: the music thins and rises, then lands on the bar with a crash and a boom.
- **Routines:** the music-note button opens the routines (Warm Up, First Scratch, Build and
  Drop, Disco Mix). **Learn** waits at each cue while the music loops: a card says what to do and
  that part of the booth glows gold. **Play** counts in for a bar, then the cues slide along a
  lane on the beat and each is judged on time; 1 to 3 stars at the end. **Slower** plays at
  0.85×. Each routine sets its own style, and yours comes back afterwards.
- **Without hands:** drag a record round to scratch, hold it still to brake; drag the crossfader
  and the filter knob; tap the pads or press 1–4; D drops; Space plays or stops; ← → move the
  crossfader, ↑ ↓ turn the filter.
- **The dock:** Routines, Style, Play / Stop, Effects (the pads and the drop), View (Front,
  Player, Close), Day / Night, How to play.

## Files

```
src/dj/
  DjScene.tsx        the scene, loaded after the home page shows
  Home.tsx           the home page
  Hud.tsx            the dock, the style and effects cards, how to play
  CameraRig.tsx      the views, fitted to the screen (layout.ts)
  Studio.tsx         the room, its baked day / night light and the LEDs
  Booth.tsx          the turntables, the mixer and the speakers, and what moves on them
  Fx.tsx             the night beams, floor glow, speaker rings and scratch streaks
  GhostHands.tsx     the two gold hands (ghost.ts)
  Hands.tsx          hand tracking: the deck hand, the mixer hand, signs, the drop
                     (handPlay.ts, signs.ts, oneEuro.ts)
  CameraGuides.tsx   the filter and crossfader guides and the action tag over your camera
  RoutinePlayer.tsx, RoutineUI.tsx, CueGlow.tsx, session.ts, routines.ts   Learn and Play
  state.ts           the beat, the decks, the mixer and the pads
  deck.ts            how a record moves (play, brake, scratch, back on the beat)
  music.ts           the four styles' loops and the pads' sounds, made in code
  audio.ts           the decks, the mixer and the effects in Web Audio
  PointerInput.tsx   drags and keys
  CameraFrame.tsx    your camera in the corner
public/models/       the studio and its bakes, the booth and the gold hand
```

Credits are in `CREDITS.md`.
