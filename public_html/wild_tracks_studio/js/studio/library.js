// Library panel: dual-entry browse (by sound type / by species), preview
// playback, always-visible species fact card, drag-to-timeline.

import { state, emitChange } from './state.js';
import { speciesColor } from './state.js';
import { playPreview, stopPreview } from '../audio.js';

let activeTab = 'sound';
let selectedRecordingId = null;
let playingRecordingId = null;

export function selectedRecording() {
  return selectedRecordingId ? state.meta.recordingsById.get(selectedRecordingId) : null;
}

export function initLibrary() {
  const tabs = document.getElementById('library-tabs');
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    for (const b of tabs.querySelectorAll('[data-tab]')) {
      b.classList.toggle('toggled', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    }
    renderLibrary();
  });
  renderLibrary();
  renderFactCard(null);
}

export function renderLibrary() {
  const meta = state.meta;
  const list = document.getElementById('library-list');
  list.textContent = '';

  const groups = [];
  if (activeTab === 'sound') {
    for (const st of meta.raw.soundTypes) {
      const recs = meta.recordingsBySoundType.get(st.id) ?? [];
      if (recs.length) groups.push({ title: `${st.emoji} ${st.label}`, subtitle: st.description, recs });
    }
  } else {
    for (const sp of meta.raw.species) {
      const recs = meta.recordingsBySpecies.get(sp.id) ?? [];
      if (recs.length) groups.push({ title: sp.commonName, recs });
    }
  }

  for (const group of groups) {
    const title = document.createElement('div');
    title.className = 'lib-group-title';
    title.textContent = group.title;
    list.appendChild(title);
    if (group.subtitle) {
      const sub = document.createElement('div');
      sub.className = 'small muted';
      sub.style.fontSize = '0.72rem';
      sub.textContent = group.subtitle;
      list.appendChild(sub);
    }
    for (const rec of group.recs) list.appendChild(sampleItem(rec));
  }
}

function sampleItem(rec) {
  const sp = state.meta.speciesById.get(rec.speciesId);
  const el = document.createElement('div');
  el.className = 'sample-item';
  el.dataset.recordingId = rec.id;
  if (rec.id === selectedRecordingId) el.classList.add('selected');
  el.draggable = true;
  el.title = 'Click to meet the bird · drag onto a track to use it';

  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  swatch.style.background = speciesColor(rec.speciesId);

  const titles = document.createElement('div');
  titles.className = 'titles';
  const spName = document.createElement('div');
  spName.className = 'sp';
  spName.textContent = sp.commonName;
  const variant = document.createElement('div');
  variant.className = 'variant';
  variant.textContent = rec.label;
  titles.append(spName, variant);

  const listen = document.createElement('button');
  listen.className = 'btn small listen';
  listen.textContent = rec.id === playingRecordingId ? '⏹' : '▶';
  listen.setAttribute('aria-label', `Listen to ${sp.commonName} ${rec.label}`);
  listen.addEventListener('click', async (e) => {
    e.stopPropagation();
    selectRecording(rec.id);
    if (playingRecordingId === rec.id) {
      stopPreview();
      playingRecordingId = null;
      renderLibrary();
    } else {
      playingRecordingId = rec.id;
      renderLibrary();
      emitChange('preview');
      await playPreview(rec, () => {
        if (playingRecordingId === rec.id) {
          playingRecordingId = null;
          renderLibrary();
          emitChange('preview');
        }
      });
    }
  });

  el.append(swatch, titles, listen);
  el.addEventListener('click', () => selectRecording(rec.id));
  el.addEventListener('dragstart', (e) => {
    selectRecording(rec.id);
    e.dataTransfer.setData('text/bird-recording', rec.id);
    e.dataTransfer.effectAllowed = 'copy';
  });
  return el;
}

export function selectRecording(id) {
  selectedRecordingId = id;
  for (const item of document.querySelectorAll('.sample-item')) {
    item.classList.toggle('selected', item.dataset.recordingId === id);
  }
  renderFactCard(state.meta.recordingsById.get(id));
}

export function previewingSpecies() {
  if (!playingRecordingId) return null;
  const rec = state.meta.recordingsById.get(playingRecordingId);
  return rec ? state.meta.speciesById.get(rec.speciesId) : null;
}

function renderFactCard(rec) {
  const card = document.getElementById('fact-card');
  card.textContent = '';
  if (!rec) {
    const p = document.createElement('p');
    p.className = 'small muted';
    p.textContent = 'Pick a sound to meet the bird behind it.';
    card.appendChild(p);
    return;
  }
  const sp = state.meta.speciesById.get(rec.speciesId);

  const img = document.createElement('img');
  img.src = sp.image;
  img.alt = sp.commonName;
  img.onerror = () => { img.onerror = null; img.src = '../base_res/img/birds/_generic.jpg'; };

  const name = document.createElement('h3');
  name.textContent = sp.commonName;

  const sci = document.createElement('div');
  sci.className = 'sci';
  sci.textContent = sp.scientificName;

  const taxon = document.createElement('div');
  taxon.className = 'small muted';
  taxon.textContent = [sp.order, sp.family].filter(Boolean).join(' · ');

  const fact = document.createElement('p');
  fact.className = 'small';
  fact.textContent = sp.fact;

  const status = document.createElement('div');
  status.className = 'status';
  const chip = document.createElement('span');
  chip.className = 'chip static';
  chip.textContent = `🌍 ${sp.conservationStatus}`;
  status.appendChild(chip);

  const stats = document.createElement('div');
  stats.className = 'fact-stats';
  for (const [label, val] of [
    ['Habitat', sp.habitatPrimary],
    ['Diet', sp.dietPrimary],
    ['Mass', sp.massAvg ? `${sp.massAvg} g avg` : null],
  ]) {
    if (!val) continue;
    const stat = document.createElement('span');
    stat.className = 'fact-stat';
    stat.innerHTML = `<span class="fact-stat-label">${label}</span> ${val}`;
    stats.appendChild(stat);
  }

  const credit = document.createElement('div');
  credit.className = 'credit';
  credit.textContent = `Recording: ${rec.attribution.recordist} · ${rec.attribution.source} · ${rec.attribution.license}`;

  card.append(img, name, sci, taxon, fact, stats, status, credit);

  if (sp.detail && window.BirdDetail) {
    const profileBtn = document.createElement('button');
    profileBtn.className = 'btn small';
    profileBtn.textContent = 'Full bird profile →';
    profileBtn.addEventListener('click', () => window.BirdDetail.open(sp.detail));
    card.appendChild(profileBtn);
  }

  card.classList.add('fade-up');
  setTimeout(() => card.classList.remove('fade-up'), 500);
}
