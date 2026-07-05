(function () {
  function serviceUrl(path) {
    const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    return (local ? 'http://localhost:3000' : '') + path;
  }

  function isUrl(val) {
    return typeof val === 'string' && /^https?:\/\//.test(val);
  }

  function renderRecords(records) {
    const grid = document.createElement('div');
    grid.className = 'res-cards';
    for (const record of records) {
      const card = document.createElement('div');
      card.className = 'res-card';
      for (const [key, val] of Object.entries(record)) {
        if (val === '' || val == null) continue;
        if (key === 'name') {
          const el = document.createElement('div');
          el.className = 'res-card-name';
          el.textContent = val;
          card.appendChild(el);
        } else {
          const el = document.createElement('div');
          el.className = 'res-card-field';
          const label = document.createElement('span');
          label.className = 'res-field-key';
          label.textContent = key + ': ';
          el.appendChild(label);
          if (isUrl(String(val))) {
            const a = document.createElement('a');
            a.href = val;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = val;
            el.appendChild(a);
          } else {
            el.appendChild(document.createTextNode(val));
          }
          card.appendChild(el);
        }
      }
      grid.appendChild(card);
    }
    return grid;
  }

  async function loadSection(section) {
    const source = section.dataset.source;
    const body = section.querySelector('.res-body');
    const loading = section.querySelector('.res-loading');
    try {
      const r = await fetch(serviceUrl('/service/data/' + source));
      if (!r.ok) throw new Error(r.statusText);
      const data = await r.json();
      if (loading) loading.remove();
      body.appendChild(renderRecords(data));
    } catch {
      if (loading) loading.textContent = 'Failed to load data.';
    }
  }

  function initToggle(section) {
    const header = section.querySelector('.res-section-header');
    const body = section.querySelector('.res-body');
    const img = section.querySelector('.res-toggle-btn img');
    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      img.src = collapsed
        ? 'base_res/img/expand_more.svg'
        : 'base_res/img/expand_less.svg';
    });
  }

  document.querySelectorAll('.data-section').forEach(section => {
    initToggle(section);
    loadSection(section);
  });
})();
