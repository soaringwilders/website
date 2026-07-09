// First-visit guided tour of the Studio (requirements §8 onboarding).

const DONE_KEY = 'birdmusic.tutorialDone';

const STEPS = [
  {
    sel: '#library-list',
    title: 'Every sound is a real bird 🐦',
    text: 'Browse the library by sound or by species. Hit ▶ on any sample to hear it.',
  },
  {
    sel: '#fact-card',
    title: 'Meet the singer',
    text: 'Whenever you pick a sound, the bird behind it shows up here. Get curious!',
  },
  {
    sel: '#timeline-wrap',
    title: 'Your song lives here',
    text: 'Drag sounds from the library onto a track. Drag clips to move them, grab their edges to trim, and use the track buttons to solo (S) or mute (M).',
  },
  {
    sel: '#inspector-anchor',
    title: 'Shape each clip',
    text: 'Select a clip to change its pitch and speed, split it, or loop it. A pitched-down chickadee sounds surprisingly cool.',
    fallback: '#timeline-wrap',
  },
  {
    sel: '#btn-play',
    title: 'Press play',
    text: 'Watch the spectrogram paint your song and see which birds are singing at every moment.',
  },
  {
    sel: '#btn-surprise',
    title: 'Stuck? Surprise yourself',
    text: 'This builds a random arrangement you can remix. When you like what you hear, Save keeps it in this browser and Export downloads real audio.',
  },
];

let idx = -1;
let card = null;

export function maybeStartTutorial() {
  if (localStorage.getItem(DONE_KEY)) return;
  idx = -1;
  next();
}

export function restartTutorial() {
  localStorage.removeItem(DONE_KEY);
  maybeStartTutorial();
}

function next() {
  cleanup();
  idx++;
  if (idx >= STEPS.length) return finish();
  const step = STEPS[idx];
  let target = document.querySelector(step.sel) ?? (step.fallback && document.querySelector(step.fallback));
  if (!target) return next();

  target.classList.add('tut-highlight');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  card = document.createElement('div');
  card.className = 'card tut-card col';
  card.style.gap = '0.5rem';

  const h = document.createElement('h3');
  h.textContent = step.title;
  const p = document.createElement('p');
  p.className = 'small muted';
  p.textContent = step.text;
  const row = document.createElement('div');
  row.className = 'row';
  const skip = document.createElement('button');
  skip.className = 'btn small btn-ghost';
  skip.textContent = 'Skip tour';
  skip.addEventListener('click', finish);
  const spacer = document.createElement('span');
  spacer.className = 'grow';
  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn small btn-primary';
  nextBtn.textContent = idx === STEPS.length - 1 ? 'Done' : `Next (${idx + 1}/${STEPS.length})`;
  nextBtn.addEventListener('click', next);
  row.append(skip, spacer, nextBtn);
  card.append(h, p, row);
  document.body.appendChild(card);

  position(target);
  nextBtn.focus();
}

function position(target) {
  const r = target.getBoundingClientRect();
  const cw = 320;
  let left = Math.min(innerWidth - cw - 16, Math.max(16, r.left));
  let top = r.bottom + 12;
  if (top > innerHeight - 180) top = Math.max(16, r.top - 170);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function cleanup() {
  for (const el of document.querySelectorAll('.tut-highlight')) el.classList.remove('tut-highlight');
  card?.remove();
  card = null;
}

function finish() {
  cleanup();
  idx = STEPS.length;
  localStorage.setItem(DONE_KEY, '1');
}
