/* =========================================================
   HABIB & ADIBA — Modern Minimalist
   ========================================================= */
'use strict';

let WEDDING_DATE = new Date('2025-12-30T07:00:00+07:00').getTime();
// Allow admin data (event.date) to override the countdown target at runtime.
window.__setWeddingDate = (ms) => { if (typeof ms === 'number' && !isNaN(ms)) WEDDING_DATE = ms; };

/* ---------- Guest personalization (?to=) ---------- */
(function personalizeGuest() {
  const to = new URLSearchParams(location.search).get('to');
  if (to) {
    const el = document.getElementById('guestName');
    if (el) el.textContent = decodeURIComponent(to);
  }
})();

/* ---------- Bind editable content from admin (server API) ----------
   Halaman tetap menampilkan konten default (hardcoded) sebagai fallback;
   kalau server hidup, nilai dari wedding.json menimpa konten tsb. */
(function contentBinding() {
  if (!window.WeddingAPI) return;
  window.WeddingAPI.getWedding()
    .then(applyWeddingData)
    .catch((err) => console.warn('Wedding data tidak dimuat (pakai konten default):', err.message));

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setText = (el, v) => { if (el && v != null && v !== '') el.textContent = v; };
  const setAttr = (el, name, v) => { if (el && v != null && v !== '') el.setAttribute(name, v); };
  const setSrc  = (el, v) => { if (el && v) el.src = v; };
  const digits  = (s) => String(s || '').replace(/\D/g, '');

  function bindPerson(person, social, sel) {
    if (!person) return;
    const root = document.querySelector(sel);
    if (!root) return;
    setSrc(root.querySelector('.person__main'), person.photo);
    setText(root.querySelector('.person__nickname'), person.nickname);
    setText(root.querySelector('.person__fullname'), person.fullname);
    setText(root.querySelector('.person__parents'), person.parents);
    if (social && social.instagram) setAttr(root.querySelector('.person__ig'), 'href', social.instagram);
  }

  function bindStory(stories) {
    const cards = document.querySelectorAll('#g3dStage .img-container');
    cards.forEach((card, i) => {
      const s = stories[i];
      if (!s) return;   // jumlah kartu 3D tetap; story berlebih diabaikan
      setSrc(card.querySelector('.card'), s.image);
      setText(card.querySelector('.card-cap__year'), s.year);
      setText(card.querySelector('.card-cap__title'), s.title);
      setText(card.querySelector('.card-cap__body'), s.description);
    });
  }

  function eventItems(event) {
    if (Array.isArray(event?.items)) return event.items;
    return ['akad', 'resepsi'].filter(key => event?.[key]).map(key => {
      const item = event[key];
      return {
        name: key === 'akad' ? 'Akad' : 'Resepsi',
        time: item.label || item.time || '',
        date: event.date || event.dateLabel || '',
        address: item.location || '',
        mapUrl: item.mapUrl || '',
        image: item.image || ''
      };
    });
  }

  function formatEventDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return date || '';
    const value = new Date(date + 'T00:00:00+07:00');
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(value);
  }

  function eventCardHTML(item) {
    const href = /^https?:\/\//i.test(item.mapUrl || '') ? item.mapUrl : '#';
    return `
      <article class="event-card">
        <img class="event-card__hero" src="${esc(item.image || '')}" alt="${esc(item.name || 'Event')}" loading="lazy" decoding="async" />
        <div class="event-card__body">
          <h3 class="event-card__title">${esc(item.name || '')}</h3>
          <p class="event-card__date">${esc(formatEventDate(item.date))}</p>
          <p class="event-card__time">${esc(item.time || '')}</p>
          <p class="event-card__address">${esc(item.address || '')}</p>
          ${href === '#' ? '' : `<a class="btn-mini" href="${esc(href)}" target="_blank" rel="noopener">View Location</a>`}
        </div>
      </article>`;
  }

  function bindBank(banks) {
    const wrap = document.querySelector('[data-w="bank-cards"]');
    if (!wrap || !banks.length) return;
    wrap.innerHTML = banks.map((b, i) => {
      const id = 'bankNum' + (i + 1);
      return `
        <article class="gift-card">
          <div class="gift-card__head">
            <span class="gift-card__bank">${esc(b.name)}</span>
            <span class="gift-card__chip" aria-hidden="true"></span>
          </div>
          <p class="gift-card__num" id="${id}">${esc(b.number)}</p>
          <p class="gift-card__name">a.n. ${esc(b.atasNama)}</p>
          <button class="btn-copy" data-copy-target="${id}" type="button">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>
            Copy
          </button>
        </article>`;
    }).join('');
  }

  function applyWeddingData(d) {
    if (!d) return;

    if (d.cover) setSrc(document.querySelector('.cover__bg'), d.cover.image);
    if (d.quote) {
      setSrc(document.querySelector('.quote__ayat'), d.quote.image);
      setText(document.querySelector('.quote__body'), d.quote.body);
      setText(document.querySelector('.quote__src'), d.quote.source);
    }
    if (d.gift) setSrc(document.querySelector('.gift__photo'), d.gift.image);
    if (d.video && d.video.src) {
      const v = document.getElementById('liveStreamVideo');
      const nextSrc = new URL(d.video.src, location.href).href;
      if (v && v.src !== nextSrc) { v.src = d.video.src; v.load(); }
    }
    if (d.music && d.music.src) {
      const a = document.getElementById('bgMusic');
      if (a && a.getAttribute('src') !== d.music.src) { a.src = d.music.src; }
    }

    bindPerson(d.mempelai && d.mempelai.groom, d.socialMedia && d.socialMedia.groom, '[data-person="groom"]');
    bindPerson(d.mempelai && d.mempelai.bride, d.socialMedia && d.socialMedia.bride, '[data-person="bride"]');

    if (Array.isArray(d.ourStory)) bindStory(d.ourStory);

    const ev = d.event;
    if (ev) {
      const items = eventItems(ev);
      const first = items[0] || {};
      const cards = document.querySelector('[data-w="event-cards"]');
      if (cards) cards.innerHTML = items.map(eventCardHTML).join('');
      const dateLabel = formatEventDate(first.date);
      setText(document.querySelector('[data-w="cover-date"]'), dateLabel);
      setText(document.querySelector('[data-w="ls-date"]'), first.time ? `${dateLabel} · ${first.time}` : dateLabel);
      if (/^\d{4}-\d{2}-\d{2}$/.test(first.date || '')) {
        const t = new Date(first.date + 'T00:00:00+07:00').getTime();
        if (!isNaN(t)) window.__setWeddingDate(t);
      }
    }

    if (d.alamat) setText(document.querySelector('[data-w="delivery"]'), d.alamat.deliveryAddress);

    if (Array.isArray(d.bank)) bindBank(d.bank);

    const wa = d.socialMedia && d.socialMedia.whatsapp;
    if (wa) setAttr(document.querySelector('[data-w="wa-gift"]'), 'href', 'https://wa.me/' + digits(wa));
  }
})();

/* ---------- Petal shower — green, continuous fall + ground pile ---------- */
(function petalShower() {
  const field = document.getElementById('petalField');
  if (!field) return;

  const SHAPES = ['sage', 'forest', 'mint', 'moss', 'jade', 'sage', 'jade'];
  const R = (min, max) => min + Math.random() * (max - min);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce) and (pointer: coarse)');
  const compact = matchMedia('(pointer: coarse)').matches;
  const PILE_MAX = compact ? 24 : 55;
  const BURST_THROUGH = compact ? 24 : 60;
  const BURST_LAND = compact ? 6 : 15;
  const pile = [];
  let started = false;
  let hasBurst = false;
  let throughTimer = 0;
  let landTimer = 0;

  function spawn(type /* 'through' | 'land' */) {
    if (!started || reducedMotion.matches || document.visibilityState === 'hidden') return;

    const p = document.createElement('span');
    p.className = 'petal petal--' + pick(SHAPES);

    const startX = R(-5, 100) + 'vw';
    const driftX = R(-28, 28) + 'vw';
    const spin = (Math.random() < .5 ? -1 : 1) * R(360, 1080) + 'deg';
    const width = R(12, 24);
    const duration = type === 'land' ? R(5.5, 8) : R(5, 8);

    p.style.setProperty('--startX', startX);
    p.style.setProperty('--driftX', driftX);
    p.style.setProperty('--spin', spin);
    p.style.width = width + 'px';
    p.style.height = width * R(1.3, 1.6) + 'px';
    p.style.animationDuration = duration + 's';

    if (type === 'land') {
      p.style.setProperty('--landX', R(0, 100) + 'vw');
      p.style.setProperty('--landY', Math.floor(R(0, 28)) + 'px');
      p.style.setProperty('--landRot', R(-150, 150) + 'deg');
      p.style.animationName = 'petalLand';
      p.addEventListener('animationend', () => { p.style.willChange = 'auto'; }, { once: true });
      field.appendChild(p);
      pile.push(p);

      if (pile.length > PILE_MAX) {
        const oldest = pile.shift();
        if (oldest) {
          oldest.style.transition = 'opacity 1.2s ease-out';
          oldest.style.opacity = '0';
          setTimeout(() => oldest.remove(), 1300);
        }
      }
    } else {
      p.style.animationName = 'petalFall';
      field.appendChild(p);
      setTimeout(() => p.remove(), duration * 1000 + 250);
    }
  }

  function scheduleNext(type, minMs, maxMs) {
    if (!started || reducedMotion.matches || document.visibilityState === 'hidden') return;
    const timer = setTimeout(() => {
      spawn(type);
      scheduleNext(type, minMs, maxMs);
    }, R(minMs, maxMs));
    if (type === 'land') landTimer = timer;
    else throughTimer = timer;
  }

  function resume() {
    if (!started || reducedMotion.matches || document.visibilityState === 'hidden') return;
    scheduleNext('through', compact ? 2400 : 900, compact ? 4200 : 2200);
    scheduleNext('land', compact ? 9000 : 4500, compact ? 15000 : 8500);
  }

  function start() {
    if (started) return;
    started = true;
    resume();
  }

  function stop() {
    clearTimeout(throughTimer);
    clearTimeout(landTimer);
    throughTimer = landTimer = 0;
  }

  function burst() {
    start();
    if (hasBurst || reducedMotion.matches) return;
    hasBurst = true;
    for (let i = 0; i < BURST_THROUGH; i++) setTimeout(() => spawn('through'), R(0, 1800));
    for (let i = 0; i < BURST_LAND; i++) setTimeout(() => spawn('land'), R(200, 2800));
  }

  document.addEventListener('visibilitychange', () => {
    stop();
    if (document.visibilityState === 'visible') resume();
  });
  reducedMotion.addEventListener('change', () => {
    stop();
    if (!reducedMotion.matches) resume();
  });

  window.__petalBurst = burst;
})();

/* ---------- Open cover ---------- */
(function openCover() {
  const btn   = document.getElementById('btnOpen');
  const cover = document.getElementById('cover');
  const main  = document.getElementById('main');
  if (!btn || !cover || !main) return;

  btn.addEventListener('click', () => {
    if (typeof window.__petalBurst === 'function') window.__petalBurst();
    if (typeof window.__startMusic === 'function') window.__startMusic();
    cover.classList.add('is-opening');
    document.body.classList.remove('is-locked');
    main.setAttribute('aria-hidden', 'false');
    window.scrollTo({ top: 0, behavior: 'instant' });

    setTimeout(() => {
      cover.remove();
    }, 2800);
  });
})();

/* ---------- Background music ---------- */
(function bgMusic() {
  const audio = document.getElementById('bgMusic');
  const btn   = document.getElementById('musicToggle');
  if (!audio || !btn) return;

  audio.loop = true;
  audio.volume = 0.7;
  let started = false;

  const play = () => { const p = audio.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); };
  const syncUI = () => {
    btn.classList.toggle('is-playing', !audio.paused);
    btn.setAttribute('aria-pressed', String(!audio.paused));
  };

  // Dipanggil saat "Open Invitation" diklik (gesture user → izin autoplay).
  window.__startMusic = () => {
    if (!audio.getAttribute('src')) return;
    btn.hidden = false;
    if (!started) { started = true; play(); }
    syncUI();
  };

  // Dipakai oleh video: unmute video → pause lagu, mute video → lanjut lagu.
  window.__musicPause  = () => { if (!audio.paused) audio.pause(); };
  window.__musicResume = () => { if (started && audio.getAttribute('src') && audio.paused) play(); };

  btn.addEventListener('click', () => {
    if (audio.paused) play(); else audio.pause();
    syncUI();
  });
  audio.addEventListener('play', syncUI);
  audio.addEventListener('pause', syncUI);
})();

/* ---------- Countdown ---------- */
(function countdown() {
  const elD = document.getElementById('cdDays');
  const elH = document.getElementById('cdHours');
  const elM = document.getElementById('cdMins');
  const elS = document.getElementById('cdSecs');
  if (!elD) return;

  const pad = (n) => String(n).padStart(2, '0');
  function tick() {
    let diff = WEDDING_DATE - Date.now();
    if (diff < 0) diff = 0;
    elD.textContent = pad(Math.floor(diff / 86400000));
    elH.textContent = pad(Math.floor((diff / 3600000) % 24));
    elM.textContent = pad(Math.floor((diff / 60000) % 60));
    elS.textContent = pad(Math.floor((diff / 1000) % 60));
  }
  tick();
  setInterval(tick, 1000);
})();

/* ---------- Add to calendar (ICS download) ---------- */
window.addToCalendar = function addToCalendar() {
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'SUMMARY:Pernikahan Eka & Salsa',
    'DTSTART:20251230T000000Z',
    'DTEND:20251230T070000Z',
    'LOCATION:Ds. Pagu\\, Wates\\, Kediri\\, Jawa Timur',
    'DESCRIPTION:Akad Nikah 07.00 WIB & Resepsi 10.00 WIB',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'EkaSalsa-Wedding.ics';
  document.body.appendChild(a); a.click(); a.remove();
};

/* ---------- Reveal on scroll ---------- */
(function reveal() {
  const main  = document.getElementById('main');
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
      } else {
        e.target.classList.remove('is-visible');
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  function start() {
    items.forEach(el => io.observe(el));
  }

  // If main is still hidden behind cover, wait until the parallax cover-open is nearly done
  if (main && main.getAttribute('aria-hidden') === 'true') {
    const mutObs = new MutationObserver(() => {
      if (main.getAttribute('aria-hidden') !== 'true') {
        mutObs.disconnect();
        // Start reveals shortly after cover begins sliding away
        setTimeout(start, 700);
      }
    });
    mutObs.observe(main, { attributes: true, attributeFilter: ['aria-hidden'] });
  } else {
    start();
  }
})();

/* ---------- Video: autoplay (muted) only while visible ---------- */
(function livestreamAutoplay() {
  const video = document.getElementById('liveStreamVideo');
  const main = document.getElementById('main');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce) and (pointer: coarse)');
  if (!video) return;

  const unmuteBtn = document.getElementById('liveStreamUnmute');
  let inView = false;
  video.muted = true;

  const isOpen = () => !main || main.getAttribute('aria-hidden') !== 'true';
  const syncPlayback = () => {
    if (inView && isOpen() && document.visibilityState === 'visible' && !reduceMotion.matches) {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } else if (document.fullscreenElement !== video && !video.webkitDisplayingFullscreen) {
      video.pause();
    }
  };

  // Button tap → unmute + play (the click itself is the user gesture the
  // browser uses to grant audio permission). Button is the ONLY way to unmute,
  // so it stays visible until the user explicitly taps it.
  if (unmuteBtn) {
    const syncBtn = () => {
      unmuteBtn.classList.toggle('is-muted', video.muted);
      unmuteBtn.setAttribute('aria-pressed', String(!video.muted));
      unmuteBtn.setAttribute('aria-label', video.muted ? 'Bunyikan suara dan layar penuh' : 'Bisukan suara');
    };
    let wasFullscreen = false;
    const leaveFullscreen = () => {
      if (!wasFullscreen) return;
      wasFullscreen = false;
      video.pause();
      video.muted = true;
      if (typeof window.__musicResume === 'function') window.__musicResume();
      syncBtn();
    };
    const enterFullscreen = () => {
      try {
        if (typeof video.requestFullscreen === 'function') {
          const p = video.requestFullscreen();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } else if (typeof video.webkitEnterFullscreen === 'function') {
          video.webkitEnterFullscreen();
        }
      } catch {}
    };
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement === video) wasFullscreen = true;
      else leaveFullscreen();
    });
    video.addEventListener('webkitbeginfullscreen', () => { wasFullscreen = true; });
    video.addEventListener('webkitendfullscreen', leaveFullscreen);
    unmuteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      video.muted = !video.muted;
      if (!video.muted) {
        video.currentTime = 0;
        const p = video.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        if (typeof window.__musicPause === 'function') window.__musicPause();
        enterFullscreen();
      } else if (typeof window.__musicResume === 'function') {
        window.__musicResume();
      }
      syncBtn();
    });
    syncBtn();
  }

  if (!('IntersectionObserver' in window)) inView = true;
  else {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      syncPlayback();
    }, { threshold: 0.35 }).observe(video);
  }

  document.addEventListener('visibilitychange', syncPlayback);
  reduceMotion.addEventListener('change', syncPlayback);
  if (main) new MutationObserver(syncPlayback).observe(main, { attributes: true, attributeFilter: ['aria-hidden'] });
  syncPlayback();
})();

/* ---------- Lottie birds: animate only while the couple section is visible ---------- */
(function coupleBirds() {
  const birds = document.querySelector('.couple__birds');
  const section = document.querySelector('.couple');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce) and (pointer: coarse)');
  if (!birds || !section) return;

  let inView = false;
  const sync = () => {
    if (typeof birds.play !== 'function' || typeof birds.pause !== 'function') return;
    if (inView && document.visibilityState === 'visible' && !reduceMotion.matches) birds.play();
    else birds.pause();
  };

  if (!('IntersectionObserver' in window)) inView = true;
  else new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    sync();
  }, { threshold: 0.15 }).observe(section);

  document.addEventListener('visibilitychange', sync);
  reduceMotion.addEventListener('change', sync);
  customElements.whenDefined('lottie-player').then(sync);
})();

/* ---------- Lightbox (zoom images) ---------- */
(function lightbox() {
  const lb    = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightboxImg');
  if (!lb) return;

  document.querySelectorAll('.carousel__slide img, .person__photo img, .event-card__hero, .gift__photo').forEach((img) => {
    img.addEventListener('click', () => {
      lbImg.src = img.src.replace(/w=\d+/, 'w=1600');
      lbImg.alt = img.alt || '';
      lb.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  });

  function close() {
    lb.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.classList.contains('lightbox__close')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();

/* ---------- Copy bank number ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-copy');
  if (!btn) return;
  const targetId = btn.dataset.copyTarget;
  const txt = document.getElementById(targetId)?.textContent.trim().replace(/\s+/g, '');
  if (!txt) return;

  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const range = document.createRange();
    range.selectNode(document.getElementById(targetId));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
  }

  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg> Copied';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.classList.remove('copied');
  }, 2000);
});

/* ---------- RSVP form + stats (server API) ---------- */
(function rsvp() {
  const form    = document.getElementById('rsvpForm');
  const wall    = document.getElementById('rsvpWall');
  const elHadir = document.getElementById('countHadir');
  const elAbsen = document.getElementById('countAbsen');
  const elTotal = document.getElementById('countTotal');
  if (!form || !wall) return;
  if (!window.WeddingAPI) {
    console.warn('WeddingAPI not loaded — make sure js/api.js is included before js/main.js');
    return;
  }

  const attendLabel = { datang: 'Attend', absen: 'Absent' };

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function renderStats(stats) {
    if (elHadir) elHadir.textContent = stats.hadir || 0;
    if (elAbsen) elAbsen.textContent = stats.absen || 0;
    if (elTotal) elTotal.textContent = stats.total || 0;
  }
  function render(comments, stats) {
    wall.innerHTML = comments.map((item) => `
      <article class="rsvp-msg">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="attend${item.attend === 'absen' ? ' absen' : ''}">${attendLabel[item.attend] || ''}</span>
        <p>${escapeHtml(item.message)}</p>
      </article>
    `).join('');
    renderStats(stats || { hadir: 0, absen: 0, total: comments.length });
  }

  async function refresh() {
    try {
      const { comments, stats } = await window.WeddingAPI.getComments();
      render(comments || [], stats);
    } catch (err) {
      console.warn('Failed to load comments:', err.message);
      wall.innerHTML = '<p class="rsvp-msg" style="opacity:.7">Gagal memuat ucapan. Coba refresh halaman.</p>';
    }
  }
  refresh();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim().slice(0, 50),
      message: String(fd.get('message') || '').trim().slice(0, 300),
      attend: String(fd.get('attend') || 'datang')
    };
    if (!payload.name || !payload.message) return;

    const btn = form.querySelector('button[type="submit"]');
    const original = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

    try {
      await window.WeddingAPI.postComment(payload);
      await refresh();
      form.reset();
      if (btn) {
        btn.textContent = '✓ Sent';
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2000);
      }
    } catch (err) {
      console.warn('Failed to submit RSVP:', err.message);
      if (btn) {
        btn.textContent = 'Gagal — coba lagi';
        setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 2500);
      }
    }
  });
})();

/* ---------- Love Story — 3D Cylinder (viewport-gated rAF + pointer drag) ---------- */
(function gallery3D() {
  const scene = document.getElementById('g3dScene');
  const stage = document.getElementById('g3dStage');
  const main = document.getElementById('main');
  if (!scene || !stage) return;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce) and (pointer: coarse)');
  const autoSpeed = -360 / 100000;
  const DRAG_SENS = 0.4;
  const DIR_THRESHOLD = 8;
  const H_DOMINANCE = 1.2;
  let rot = -50;
  let velocity = 0;
  let isDragging = false;
  let hoverPaused = false;
  let inView = false;
  let frame = 0;
  let lastT = performance.now();
  let pointerId = null;
  let pending = false;
  let committed = false;
  let startX = 0;
  let startY = 0;
  let startRot = 0;
  let lastX = 0;
  let lastDragT = 0;

  function apply() {
    stage.style.setProperty('--rot', rot.toFixed(3) + 'deg');
  }

  function isActive() {
    return inView && document.visibilityState === 'visible' && (!main || main.getAttribute('aria-hidden') !== 'true');
  }

  function shouldAnimate() {
    return isActive() && !isDragging && (Math.abs(velocity) > 0.0001 || (!reduceMotion.matches && !hoverPaused));
  }

  function stopTick() {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function startTick() {
    if (frame || !shouldAnimate()) return;
    lastT = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function tick(t) {
    frame = 0;
    if (!shouldAnimate()) return;
    const dt = t - lastT;
    lastT = t;

    if (Math.abs(velocity) > 0.0001) {
      rot += velocity * dt;
      velocity *= Math.pow(0.94, dt / 16.67);
      if (Math.abs(velocity) < 0.002) velocity = 0;
    } else if (!reduceMotion.matches && !hoverPaused) {
      rot += autoSpeed * dt;
    }
    apply();
    startTick();
  }

  function syncTick() {
    if (shouldAnimate()) startTick();
    else stopTick();
  }

  function resetPointer() {
    pointerId = null;
    pending = false;
    committed = false;
    if (isDragging) {
      isDragging = false;
      scene.classList.remove('is-dragging');
    }
    startTick();
  }

  function updateDrag(e) {
    rot = startRot + (e.clientX - startX) * DRAG_SENS;
    apply();
    const now = performance.now();
    const dt = now - lastDragT;
    if (dt > 0) velocity = ((e.clientX - lastX) * DRAG_SENS) / dt;
    lastX = e.clientX;
    lastDragT = now;
  }

  function commitDrag(e) {
    pending = false;
    committed = true;
    isDragging = true;
    velocity = 0;
    scene.classList.add('is-dragging');
    if (!scene.hasPointerCapture(e.pointerId)) scene.setPointerCapture(e.pointerId);
    stopTick();
  }

  function onPointerDown(e) {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    startRot = rot;
    lastDragT = performance.now();
    pending = true;
    committed = false;
  }

  function onPointerMove(e) {
    if (e.pointerId !== pointerId) return;
    if (committed) {
      updateDrag(e);
      return;
    }
    if (!pending) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < DIR_THRESHOLD && Math.abs(dy) < DIR_THRESHOLD) return;
    if (Math.abs(dx) > H_DOMINANCE * Math.abs(dy)) {
      commitDrag(e);
      updateDrag(e);
    } else {
      resetPointer();
    }
  }

  function onPointerEnd(e) {
    if (e.pointerId !== pointerId) return;
    if (scene.hasPointerCapture(e.pointerId)) scene.releasePointerCapture(e.pointerId);
    resetPointer();
  }

  if ('PointerEvent' in window) {
    scene.addEventListener('pointerdown', onPointerDown);
    scene.addEventListener('pointermove', onPointerMove);
    scene.addEventListener('pointerup', onPointerEnd);
    scene.addEventListener('pointercancel', onPointerEnd);
    scene.addEventListener('lostpointercapture', resetPointer);
  }

  if (!matchMedia('(hover: none)').matches) {
    scene.addEventListener('pointerenter', () => { hoverPaused = true; syncTick(); });
    scene.addEventListener('pointerleave', () => { hoverPaused = false; syncTick(); });
  }

  if (!('IntersectionObserver' in window)) inView = true;
  else new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    syncTick();
  }, { threshold: 0.95 }).observe(scene);

  document.addEventListener('visibilitychange', syncTick);
  reduceMotion.addEventListener('change', syncTick);
  if (main) new MutationObserver(syncTick).observe(main, { attributes: true, attributeFilter: ['aria-hidden'] });
  apply();
  syncTick();
})();
