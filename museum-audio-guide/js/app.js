/* Why Then: museum audio guide demo. Plain JS, no build step, local JSON only. */
(function () {
  'use strict';

  // tts = BCP 47 tag passed to speechSynthesis; ttsAlt = other acceptable voice tags.
  var LANGS = [
    { code: 'en', name: 'English', tts: 'en-GB', ttsAlt: ['en'] },
    { code: 'fr', name: 'Français', tts: 'fr-FR', ttsAlt: ['fr'] },
    { code: 'de', name: 'Deutsch', tts: 'de-DE', ttsAlt: ['de'] },
    { code: 'zh-Hant', name: '中文（繁體）', tts: 'zh-TW', ttsAlt: ['zh-HK', 'zh'] },
    { code: 'zh-Hans', name: '中文（简体）', tts: 'zh-CN', ttsAlt: ['zh'] },
    { code: 'nl', name: 'Nederlands', tts: 'nl-NL', ttsAlt: ['nl'] },
    { code: 'uk', name: 'Українська', tts: 'uk-UA', ttsAlt: ['uk'] },
    { code: 'ar', name: 'العربية', tts: 'ar-SA', ttsAlt: ['ar'], rtl: true },
    { code: 'fa', name: 'فارسی', tts: 'fa-IR', ttsAlt: ['fa'], rtl: true },
    { code: 'es', name: 'Español', tts: 'es-ES', ttsAlt: ['es'] },
    { code: 'it', name: 'Italiano', tts: 'it-IT', ttsAlt: ['it'] },
    { code: 'pt', name: 'Português', tts: 'pt-PT', ttsAlt: ['pt'] },
    { code: 'ja', name: '日本語', tts: 'ja-JP', ttsAlt: ['ja'] },
    { code: 'ko', name: '한국어', tts: 'ko-KR', ttsAlt: ['ko'] }
  ];
  var TYPES = ['art_movement', 'world_event', 'tech', 'literature'];

  var state = {
    lang: 'en',
    museums: [], paintings: [], events: [], credits: {},
    en: null, cur: null,
    byId: { painting: {}, event: {}, museum: {} }
  };

  var $app = document.getElementById('app');
  var $sheet = document.getElementById('sheet');
  var $backdrop = document.getElementById('sheet-backdrop');
  var $back = document.getElementById('back-btn');
  var $langSelect = document.getElementById('lang-select');

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loadJSON(path, optional) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { if (optional) return null; throw new Error(path + ': HTTP ' + r.status); }
      return r.json();
    }).catch(function (e) { if (optional) return null; throw e; });
  }
  function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function langInfo(code) { return LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0]; }

  // UI string, falls back to English, then to the key.
  function t(key, vars) {
    var s = (state.cur && state.cur.ui && state.cur.ui[key]) || (state.en.ui[key]) || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  // Content text: translation overlay if present, else the English base record.
  // Returns { text, translated } so the UI can flag machine-translated text.
  function tc(kind, id, field) {
    var c = state.cur && state.cur.content && state.cur.content[kind] && state.cur.content[kind][id];
    if (state.lang !== 'en' && c && c[field]) return { text: c[field], translated: true };
    var rec = state.byId[kind][id];
    var v = rec && rec[field];
    return { text: v && typeof v === 'object' ? v.text : v, translated: false };
  }
  function statusPill(kind, id, field) {
    var rec = state.byId[kind][id];
    var st = rec && rec[field] && rec[field].status;
    var parts = [];
    if (st) parts.push(t('status_draft'));
    if (tc(kind, id, field).translated) parts.push(t('status_machine_translation'));
    return parts.length ? '<span class="pill pill-status">' + esc(parts.join(' · ')) + '</span>' : '';
  }
  function fwd() { return langInfo(state.lang).rtl ? '←' : '→'; }
  function bwd() { return langInfo(state.lang).rtl ? '→' : '←'; }
  function typeTag(type) {
    return '<span class="tag tag-' + esc(type) + '">' + esc(t('type_' + type)) + '</span>';
  }

  // ---------- images ----------
  function imageHTML(p, cls) {
    var credit = state.credits[p.id];
    var title = tc('painting', p.id, 'title').text;
    if (credit && credit.file) {
      return '<img class="' + cls + '" src="' + esc(credit.file) + '" alt="' + esc(title + ', ' + p.artist + ', ' + p.year) + '" loading="lazy" data-fallback="' + esc(p.id) + '">';
    }
    return placeholderHTML(p, cls);
  }
  function placeholderHTML(p, cls) {
    var hue = (p.number * 47) % 360;
    return '<div class="' + cls + ' placeholder" style="--h:' + hue + '" role="img" aria-label="' + esc(t('image_missing')) + '">' +
      '<span class="ph-num">' + esc(p.number) + '</span>' +
      '<span class="ph-note">' + esc(t('image_missing')) + '</span></div>';
  }
  function wireImageFallbacks(root) {
    Array.prototype.forEach.call(root.querySelectorAll('img[data-fallback]'), function (img) {
      img.addEventListener('error', function () {
        var p = state.byId.painting[img.getAttribute('data-fallback')];
        var wrap = document.createElement('div');
        wrap.innerHTML = placeholderHTML(p, img.className);
        img.replaceWith(wrap.firstChild);
      });
    });
  }
  function creditHTML(p) {
    var c = state.credits[p.id];
    if (!c) return '<p class="credit">' + esc(t('image_credit_missing')) + '</p>';
    return '<p class="credit">' + esc(t('image_source')) + ': <a href="' + esc(c.source_url) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' +
      (c.author ? ' · ' + esc(c.author) : '') +
      ' · ' + esc(t('image_license')) + ': ' + (c.license_url ? '<a href="' + esc(c.license_url) + '" target="_blank" rel="noopener">' + esc(c.license) + '</a>' : esc(c.license || '?')) +
      ' · <span class="pill pill-status">' + esc(t('status_license_check')) + '</span></p>';
  }

  // ---------- text-to-speech ----------
  var tts = { chunks: [], idx: 0, playing: false, paused: false, voiceWarn: '' };
  var synth = window.speechSynthesis;

  function pickVoice(info) {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    var norm = function (s) { return String(s || '').toLowerCase().replace('_', '-'); };
    var wanted = [info.tts].concat(info.ttsAlt || []).map(norm);
    for (var i = 0; i < wanted.length; i++) {
      var w = wanted[i];
      var hit = voices.filter(function (v) { var l = norm(v.lang); return l === w || l.indexOf(w + '-') === 0; })[0];
      if (hit) return hit;
    }
    return null;
  }
  // Long utterances get cut off in some browsers, so speak sentence by sentence.
  function splitSentences(text) {
    var parts = String(text).match(/[^.!?。！？؟]+[.!?。！？؟]*["'”’»」』)]*\s*/g) || [text];
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function ttsStop() {
    if (synth) synth.cancel();
    tts.chunks = []; tts.idx = 0; tts.playing = false; tts.paused = false;
    updatePlayer();
  }
  function ttsSpeakNext(info, voice) {
    if (!tts.playing) return;
    if (tts.idx >= tts.chunks.length) { ttsStop(); return; }
    var u = new SpeechSynthesisUtterance(tts.chunks[tts.idx]);
    u.lang = voice ? voice.lang : info.tts;
    if (voice) u.voice = voice;
    u.rate = 1;
    u.onend = function () { tts.idx++; ttsSpeakNext(info, voice); };
    u.onerror = function (e) {
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      tts.idx++; ttsSpeakNext(info, voice);
    };
    synth.speak(u);
  }
  function ttsPlay(text) {
    if (!synth) return;
    ttsStop();
    var info = langInfo(state.lang);
    var voice = pickVoice(info);
    tts.voiceWarn = voice ? '' : t('no_voice');
    tts.chunks = splitSentences(text);
    tts.idx = 0; tts.playing = true; tts.paused = false;
    updatePlayer();
    ttsSpeakNext(info, voice);
  }
  function ttsTogglePause() {
    if (!synth || !tts.playing) return;
    if (tts.paused) { synth.resume(); tts.paused = false; } else { synth.pause(); tts.paused = true; }
    updatePlayer();
  }
  function updatePlayer() {
    var el = document.getElementById('player');
    if (!el) return;
    var play = el.querySelector('[data-action="play"]');
    var pause = el.querySelector('[data-action="pause"]');
    var stop = el.querySelector('[data-action="stop"]');
    var note = el.querySelector('.player-note');
    play.hidden = tts.playing;
    pause.hidden = !tts.playing;
    stop.hidden = !tts.playing;
    pause.textContent = tts.paused ? '▶ ' + t('resume') : '❚❚ ' + t('pause');
    note.textContent = tts.voiceWarn;
  }
  if (synth && 'onvoiceschanged' in synth) synth.onvoiceschanged = function () { /* voices load async; picked at play time */ };

  function paintingScript(p) {
    var lines = [];
    lines.push(tc('painting', p.id, 'title').text + '. ' + p.artist + ', ' + p.year + '.');
    lines.push(t('quick_take') + '.');
    lines.push(tc('painting', p.id, 'quick_take').text);
    lines.push(t('why_then') + '.');
    p.why_then.forEach(function (eid) {
      var ev = state.byId.event[eid];
      lines.push(ev.year_label + '. ' + tc('event', eid, 'title').text + '.');
      lines.push(tc('event', eid, 'short_text').text);
    });
    return lines.join(' ');
  }

  // ---------- views ----------
  function viewHome() {
    var cards = state.museums.map(function (m) {
      var n = m.paintings.length;
      return '<a class="card museum-card" href="#/museum/' + esc(m.id) + '">' +
        '<span class="pill">' + esc(t('fictional_museum')) + '</span>' +
        '<h2>' + esc(tc('museum', m.id, 'name').text) + '</h2>' +
        '<p class="muted">' + esc(tc('museum', m.id, 'city').text) + ' · ' + esc(t('paintings_count', { n: n })) + '</p>' +
        '<p>' + esc(tc('museum', m.id, 'description').text) + '</p>' +
        '</a>';
    }).join('');
    return '<section class="view">' +
      '<h1 class="h-hero">' + esc(t('tagline')) + '</h1>' +
      '<p class="lead">' + esc(t('intro')) + '</p>' +
      '<h2 class="h-section">' + esc(t('choose_museum')) + '</h2>' +
      '<div class="stack">' + cards + '</div>' +
      '<section class="feedback"><h2 class="h-section">' + esc(t('feedback_title')) + '</h2>' +
      '<p class="muted">' + esc(t('feedback_intro')) + '</p><ol>' +
      [1, 2, 3, 4, 5].map(function (i) { return '<li>' + esc(t('feedback_' + i)) + '</li>'; }).join('') +
      '</ol></section></section>';
  }

  function viewMuseum(id) {
    var m = state.byId.museum[id];
    if (!m) return viewNotFound();
    var list = m.paintings.map(function (pid) {
      var p = state.byId.painting[pid];
      return '<li><a class="row" href="#/painting/' + esc(p.id) + '">' +
        imageHTML(p, 'thumb') +
        '<span class="row-text"><span class="num">' + esc(t('number_short')) + ' ' + esc(p.number) + '</span>' +
        '<strong>' + esc(tc('painting', p.id, 'title').text) + '</strong>' +
        '<span class="muted">' + esc(p.artist) + ', ' + esc(p.year) + '</span></span></a></li>';
    }).join('');
    var body = m.paintings.length
      ? '<form class="number-form" id="number-form" autocomplete="off">' +
          '<label for="num-input">' + esc(t('enter_number')) + '</label>' +
          '<div class="number-row"><input id="num-input" inputmode="numeric" pattern="[0-9]*" placeholder="101" maxlength="4">' +
          '<button class="btn" type="submit">' + esc(t('go')) + '</button></div>' +
          '<p class="form-error" id="num-error" role="alert"></p></form>' +
        '<h2 class="h-section">' + esc(t('or_browse')) + '</h2><ul class="list">' + list + '</ul>'
      : '<p class="empty">' + esc(t('museum_empty')) + '</p>';
    return '<section class="view">' +
      '<span class="pill">' + esc(t('fictional_museum')) + '</span>' +
      '<h1>' + esc(tc('museum', m.id, 'name').text) + '</h1>' +
      '<p class="muted">' + esc(tc('museum', m.id, 'description').text) + '</p>' +
      body + '</section>';
  }

  function eventItemHTML(eid, currentPid) {
    var ev = state.byId.event[eid];
    return '<li><button class="event-item" type="button" data-event="' + esc(eid) + '" data-from="' + esc(currentPid || '') + '">' +
      '<span class="event-year">' + esc(ev.year_label) + '</span>' +
      '<span class="event-body">' + typeTag(ev.type) +
      '<strong>' + esc(tc('event', eid, 'title').text) + '</strong>' +
      '<span class="event-text">' + esc(tc('event', eid, 'short_text').text) + '</span></span></button></li>';
  }

  function viewPainting(id) {
    var p = state.byId.painting[id];
    if (!p) return viewNotFound();
    var title = tc('painting', p.id, 'title').text;
    var player = synth
      ? '<div class="player" id="player">' +
          '<button class="btn btn-play" type="button" data-action="play">▶ ' + esc(t('play')) + '</button>' +
          '<button class="btn" type="button" data-action="pause" hidden></button>' +
          '<button class="btn btn-ghost" type="button" data-action="stop" hidden>■ ' + esc(t('stop')) + '</button>' +
          '<p class="player-note" aria-live="polite"></p></div>'
      : '<p class="player-note">' + esc(t('tts_unsupported')) + '</p>';

    return '<article class="view painting">' +
      // a. image, title, artist, year
      '<figure class="hero">' + imageHTML(p, 'hero-img') + creditHTML(p) + '</figure>' +
      '<p class="num">' + esc(t('number_short')) + ' ' + esc(p.number) + '</p>' +
      '<h1>' + esc(title) + '</h1>' +
      '<p class="meta">' + esc(p.artist) + ' · ' + esc(p.year) + '</p>' +
      '<p class="muted small"><em>' + esc(p.original_title) + '</em> · ' + esc(t('real_collection')) + ': ' + esc(tc('painting', p.id, 'real_collection').text) + '</p>' +
      // d. play
      player +
      // b. quick take
      '<section class="block"><h2 class="h-section">' + esc(t('quick_take')) + '</h2>' +
        '<p class="quick-take">' + esc(tc('painting', p.id, 'quick_take').text) + '</p>' + statusPill('painting', p.id, 'quick_take') + '</section>' +
      // c. why this, why then
      '<section class="block"><h2 class="h-section">' + esc(t('why_then')) + '</h2>' +
        '<ol class="events">' + p.why_then.map(function (e) { return eventItemHTML(e, p.id); }).join('') + '</ol>' +
        '<a class="btn btn-wide" href="#/timeline/' + esc(p.id) + '">' + esc(t('open_timeline')) + ' ' + fwd() + '</a></section>' +
      '</article>';
  }

  function viewTimeline(pid) {
    var p = state.byId.painting[pid];
    if (!p) return viewNotFound();
    var linked = {};
    p.why_then.forEach(function (e) { linked[e] = true; });

    // Events and paintings on one strip, ordered by year (paintings after events of the same year).
    var items = state.events.map(function (ev) { return { kind: 'event', year: ev.year, ev: ev }; })
      .concat(state.paintings.map(function (x) { return { kind: 'painting', year: parseInt(x.year, 10), p: x }; }));
    items.sort(function (a, b) { return a.year - b.year || (a.kind === b.kind ? 0 : a.kind === 'event' ? -1 : 1); });

    var strip = items.map(function (it) {
      if (it.kind === 'event') {
        var ev = it.ev;
        var cls = 'tl-card tl-event' + (linked[ev.id] ? ' is-linked' : '');
        return '<li><button class="' + cls + '" type="button" data-event="' + esc(ev.id) + '" data-from="' + esc(p.id) + '">' +
          '<span class="tl-year">' + esc(ev.year_label) + '</span>' + typeTag(ev.type) +
          '<strong>' + esc(tc('event', ev.id, 'title').text) + '</strong>' +
          (linked[ev.id] ? '<span class="tl-linked">' + esc(t('linked_to_this')) + '</span>' : '') +
          '</button></li>';
      }
      var x = it.p;
      var current = x.id === p.id;
      return '<li><a class="tl-card tl-painting' + (current ? ' is-current' : '') + '" href="#/timeline/' + esc(x.id) + '"' +
        (current ? ' id="tl-current" aria-current="true"' : '') + '>' +
        '<span class="tl-year">' + esc(x.year) + '</span>' +
        imageHTML(x, 'tl-thumb') +
        '<strong>' + esc(tc('painting', x.id, 'title').text) + '</strong>' +
        (current ? '<span class="tl-here">' + esc(t('you_are_here')) + '</span>' : '<span class="muted small">' + esc(x.artist) + '</span>') +
        '</a></li>';
    }).join('');

    var first = items[0].year, last = items[items.length - 1].year;
    var legend = TYPES.map(typeTag).join(' ');
    return '<section class="view timeline-view">' +
      '<h1>' + esc(t('timeline')) + ' <bdi dir="ltr" class="muted">' + first + '–' + last + '</bdi></h1>' +
      '<p class="muted">' + esc(t('timeline_hint')) + '</p>' +
      '<div class="legend">' + legend + '</div>' +
      '<div class="tl-scroller" tabindex="0" aria-label="' + esc(t('timeline')) + '"><ol class="tl-strip">' + strip + '</ol></div>' +
      '<a class="btn btn-wide" href="#/painting/' + esc(p.id) + '">' + bwd() + ' ' + esc(tc('painting', p.id, 'title').text) + '</a>' +
      '</section>';
  }

  function viewNotFound() {
    return '<section class="view"><h1>' + esc(t('not_found_page')) + '</h1><a class="btn" href="#/">' + esc(t('home')) + '</a></section>';
  }

  // ---------- event sheet ----------
  function openSheet(eid, fromPid) {
    var ev = state.byId.event[eid];
    if (!ev) return;
    var links = ev.related_paintings.map(function (pid) {
      var x = state.byId.painting[pid];
      var cur = pid === fromPid;
      return '<li><a class="row' + (cur ? ' is-current' : '') + '" href="#/painting/' + esc(pid) + '">' + imageHTML(x, 'thumb') +
        '<span class="row-text"><strong>' + esc(tc('painting', pid, 'title').text) + '</strong>' +
        '<span class="muted">' + esc(x.artist) + ', ' + esc(x.year) + (cur ? ' · ' + esc(t('you_are_here')) : '') + '</span></span></a></li>';
    }).join('');
    $sheet.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"></div>' +
      '<button class="icon-btn sheet-close" type="button" data-action="close-sheet" aria-label="' + esc(t('close')) + '">×</button>' +
      '<p class="tl-year">' + esc(ev.year_label) + '</p>' + typeTag(ev.type) +
      '<h2 id="sheet-title">' + esc(tc('event', eid, 'title').text) + '</h2>' +
      '<p>' + esc(tc('event', eid, 'short_text').text) + '</p>' + statusPill('event', eid, 'short_text') +
      '<h3 class="h-section">' + esc(t('linked_paintings')) + '</h3>' +
      (links ? '<ul class="list">' + links + '</ul>' : '<p class="muted">' + esc(t('no_linked')) + '</p>');
    wireImageFallbacks($sheet);
    $sheet.hidden = false; $backdrop.hidden = false;
    document.body.classList.add('sheet-open');
    $sheet.querySelector('.sheet-close').focus();
  }
  function closeSheet() {
    if ($sheet.hidden) return;
    $sheet.hidden = true; $backdrop.hidden = true;
    document.body.classList.remove('sheet-open');
  }

  // ---------- router ----------
  function parseRoute() {
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    return { name: parts[0] || 'home', id: decodeURIComponent(parts[1] || '') };
  }
  function render() {
    tts.voiceWarn = '';
    ttsStop();
    closeSheet();
    var r = parseRoute();
    var html;
    if (r.name === 'home') html = viewHome();
    else if (r.name === 'museum') html = viewMuseum(r.id);
    else if (r.name === 'painting') html = viewPainting(r.id);
    else if (r.name === 'timeline') html = viewTimeline(r.id);
    else html = viewNotFound();
    $app.innerHTML = html;
    wireImageFallbacks($app);
    $back.hidden = r.name === 'home';
    $back.dataset.target = backTarget(r);
    updatePlayer();
    if (r.name === 'timeline') {
      var cur = document.getElementById('tl-current');
      if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    window.scrollTo(0, 0);
    $app.focus({ preventScroll: true });
  }
  function backTarget(r) {
    if (r.name === 'museum') return '#/';
    if (r.name === 'painting') { var p = state.byId.painting[r.id]; return p ? '#/museum/' + p.museum_id : '#/'; }
    if (r.name === 'timeline') return '#/painting/' + r.id;
    return '#/';
  }

  // ---------- chrome & language ----------
  function applyChrome() {
    var info = langInfo(state.lang);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = info.rtl ? 'rtl' : 'ltr';
    document.title = t('app_name');
    document.getElementById('brand').textContent = t('app_name');
    document.getElementById('lang-label').textContent = t('language');
    $back.setAttribute('aria-label', t('back'));
    $back.innerHTML = info.rtl ? '&rarr;' : '&larr;';
    var banner = t('demo_banner');
    if (state.lang !== 'en') banner += ' ' + t('translation_note');
    document.getElementById('demo-banner').textContent = banner;
  }
  function setLang(code) {
    var info = langInfo(code);
    var p = info.code === 'en' ? Promise.resolve(state.en) : loadJSON('i18n/' + info.code + '.json', true);
    return p.then(function (data) {
      state.lang = data ? info.code : 'en';
      state.cur = data || state.en;
      $langSelect.value = state.lang;
      storeSet('whythen.lang', state.lang);
      applyChrome();
      render();
    });
  }
  function initialLang() {
    var saved = storeGet('whythen.lang');
    if (saved && langInfo(saved).code === saved) return saved;
    var nav = (navigator.languages || [navigator.language || 'en']).map(function (l) { return String(l); });
    for (var i = 0; i < nav.length; i++) {
      var l = nav[i].toLowerCase();
      if (l.indexOf('zh') === 0) return /hant|tw|hk|mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
      var hit = LANGS.filter(function (x) { return x.code === l.split('-')[0]; })[0];
      if (hit) return hit.code;
    }
    return 'en';
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-event],[data-action]');
    if (!el) return;
    if (el.hasAttribute('data-event')) { openSheet(el.getAttribute('data-event'), el.getAttribute('data-from')); return; }
    var a = el.getAttribute('data-action');
    if (a === 'close-sheet') closeSheet();
    else if (a === 'play') { var r = parseRoute(); var p = state.byId.painting[r.id]; if (p) ttsPlay(paintingScript(p)); }
    else if (a === 'pause') ttsTogglePause();
    else if (a === 'stop') ttsStop();
  });
  $backdrop.addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  $back.addEventListener('click', function () { location.hash = $back.dataset.target || '#/'; });
  $langSelect.addEventListener('change', function () { ttsStop(); setLang($langSelect.value); });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'number-form') return;
    e.preventDefault();
    var r = parseRoute();
    var m = state.byId.museum[r.id];
    var n = parseInt(document.getElementById('num-input').value, 10);
    var hit = m && m.paintings.map(function (id) { return state.byId.painting[id]; }).filter(function (p) { return p.number === n; })[0];
    if (hit) location.hash = '#/painting/' + hit.id;
    else document.getElementById('num-error').textContent = t('not_found_number');
  });
  window.addEventListener('hashchange', render);

  // ---------- boot ----------
  Promise.all([
    loadJSON('data/museums.json'),
    loadJSON('data/paintings.json'),
    loadJSON('data/timeline_events.json'),
    loadJSON('data/image_credits.json', true),
    loadJSON('i18n/en.json')
  ]).then(function (res) {
    state.museums = res[0]; state.paintings = res[1]; state.events = res[2];
    state.credits = res[3] || {}; state.en = res[4]; state.cur = res[4];
    state.museums.forEach(function (m) { state.byId.museum[m.id] = m; });
    state.paintings.forEach(function (p) { state.byId.painting[p.id] = p; });
    state.events.forEach(function (ev) { state.byId.event[ev.id] = ev; });
    $langSelect.innerHTML = LANGS.map(function (l) { return '<option value="' + l.code + '">' + esc(l.name) + '</option>'; }).join('');
    return setLang(initialLang());
  }).catch(function (err) {
    $app.innerHTML = '<section class="view"><h1>Could not load data</h1><p>' + esc(err.message) +
      '</p><p>Open this app through a local web server (see README), not by double-clicking index.html.</p></section>';
  });
})();
