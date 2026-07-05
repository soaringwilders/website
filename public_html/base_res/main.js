function makeCarousel(trackEl, prevBtn, nextBtn, getVisible) {
  let index = 0;
  const items = Array.from(trackEl.children);

  function total() { return items.length; }

  function clamp(i) {
    return Math.max(0, Math.min(i, total() - getVisible()));
  }

  function update() {
    const vis = getVisible();
    // Each item is exactly (100/vis)% of the track-wrap; no gap involved.
    const pct = (100 / vis) * index;
    trackEl.style.transform = `translateX(-${pct}%)`;
    if (prevBtn) prevBtn.disabled = index === 0;
    if (nextBtn) nextBtn.disabled = index >= total() - vis;
  }

  function go(delta) {
    index = clamp(index + delta);
    update();
  }

  if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => go(1));

  window.addEventListener('resize', () => {
    index = clamp(index);
    update();
  });

  update();
}

document.addEventListener('DOMContentLoaded', () => {
  const iconTrack = document.getElementById('icon-track');
  const iconPrev  = document.getElementById('icon-prev');
  const iconNext  = document.getElementById('icon-next');
  if (iconTrack) {
    makeCarousel(iconTrack, iconPrev, iconNext, () =>
      window.innerWidth < 768 ? 2 : 4
    );
  }

  const cardsTrack = document.getElementById('cards-track');
  const cardsPrev  = document.getElementById('cards-prev');
  const cardsNext  = document.getElementById('cards-next');
  if (cardsTrack) {
    makeCarousel(cardsTrack, cardsPrev, cardsNext, () => {
      if (window.innerWidth < 768) return 1;
      if (window.innerWidth < 900) return 2;
      return 3;
    });
  }
});
