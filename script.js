'use strict';
(function () {

/* ═══════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : d } catch { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } },
};
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// Animated count-up
function countUp(el, target) {
  if (!el) return;
  const start = performance.now(), dur = 700;
  const from = parseInt(el.textContent) || 0;
  const step = ts => {
    const p = Math.min((ts - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + ease * (target - from));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
// Debounce
function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) };
}

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
const DEFAULT_PW = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
let isAdmin = false;
let pwHash = LS.get('pwHash', DEFAULT_PW);

let profile = LS.get('profile', {
  nickname: 'Your Name',
  profession: 'Professional Title · Location',
  bio: 'A short description about yourself.',
  avatar: null, bg: null, available: true,
});
let contacts   = LS.get('contacts',   []);
let skills     = LS.get('skills',     []);
let links      = LS.get('links',      []);
let projects   = LS.get('projects',   []);
let linkClicks = LS.get('linkClicks', {});

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 1: MULTI-THEME with meta-tag update
═══════════════════════════════════════════════════════ */
const THEMES = [
  { key: 'dark',  label: '◐ Light',  meta: '#0b0f14' },
  { key: 'light', label: '◑ Neon',   meta: '#f0f4f8' },
  { key: 'neon',  label: '◐ Dark',   meta: '#07000f' },
];
let themeIdx = LS.get('themeIdx', 0);
function applyTheme() {
  const t = THEMES[themeIdx];
  document.documentElement.setAttribute('data-theme', t.key);
  $('themeBtn').textContent = t.label;
  const mt = $('metaTheme'); if (mt) mt.content = t.meta;
}
$('themeBtn').onclick = () => { themeIdx = (themeIdx + 1) % THEMES.length; LS.set('themeIdx', themeIdx); applyTheme(); };
applyTheme();

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 2: SCROLL PROGRESS BAR
═══════════════════════════════════════════════════════ */
const scrollBar = $('scrollProgress');
window.addEventListener('scroll', () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  scrollBar.style.width = max > 0 ? (window.scrollY / max * 100) + '%' : '0';
}, { passive: true });

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 3: PAGE TITLE from profile nickname
═══════════════════════════════════════════════════════ */
function updatePageMeta() {
  const pt = $('pageTitle');
  if (pt) pt.textContent = profile.nickname + ' — Profile';
  const pd = $('metaDesc');
  if (pd) pd.content = profile.bio?.slice(0, 120) || 'Professional profile';
}

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 4: TOAST STACK (multiple toasts)
═══════════════════════════════════════════════════════ */
function toast(msg, type = '') {
  const stack = $('toastStack');
  const el = document.createElement('div');
  el.className = 'toast-item' + (type ? ' ' + type : '');
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2800);
}

/* ═══════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════ */
let modalResolve = null;
const modal = $('modal');
function openModal({ title, fields, confirmText = 'Save', hideFoot = false }) {
  $('modalTitle').textContent = title;
  $('modalConfirm').textContent = confirmText;
  $('modalFooter').style.display = hideFoot ? 'none' : '';
  const body = $('modalBody');
  body.innerHTML = fields;
  modal.classList.add('open');
  modal.removeAttribute('aria-hidden');
  const first = body.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 80);
  return new Promise(res => { modalResolve = res; });
}
function closeModal(val = null) {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (modalResolve) { modalResolve(val); modalResolve = null; }
}
$('modalClose').onclick     = () => closeModal(null);
$('modalCancel').onclick    = () => closeModal(null);
$('modalBackdrop').onclick  = () => closeModal(null);
$('modalConfirm').onclick   = () => closeModal('confirm');
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.classList.contains('open')) closeModal(null);
  if (e.key === 'Enter'  && modal.classList.contains('open') && document.activeElement?.tagName === 'INPUT') closeModal('confirm');
});

/* ═══════════════════════════════════════════════════════
   ADMIN AUTH
═══════════════════════════════════════════════════════ */
async function tryLogin() {
  const res = await openModal({
    title: '🔐 Admin Login',
    fields: `<div class="field"><label>Password</label>
      <input type="password" id="pwIn" placeholder="Password" autocomplete="current-password"></div>`,
    confirmText: 'Login',
  });
  if (res !== 'confirm') return;
  const hash = await sha256($('pwIn')?.value || '');
  if (hash === pwHash) {
    isAdmin = true; LS.set('adminSession', '1'); applyAdminUI(); toast('✓ Logged in as admin', 'ok');
  } else {
    toast('✗ Wrong password', 'err');
  }
}
function logout() { isAdmin = false; LS.set('adminSession', '0'); applyAdminUI(); toast('Logged out'); }

function applyAdminUI() {
  const label = $('adminLabel');
  label.className = 'topbar__status' + (isAdmin ? ' is-admin' : '');
  label.innerHTML = isAdmin
    ? `<svg class="topbar__status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span class="topbar__status-text"> Admin mode</span>`
    : `<svg class="topbar__status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span class="topbar__status-text"> View mode</span>`;
  $('adminLoginBtn').classList.toggle('hidden', isAdmin);
  $('adminLogoutBtn').classList.toggle('hidden', !isAdmin);
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  renderAll();
}
$('adminLoginBtn').onclick = tryLogin;
$('adminLogoutBtn').onclick = logout;

/* PASSWORD CHANGE */
$('changePwBtn').onclick = async () => {
  const res = await openModal({
    title: '🔑 Change Password',
    fields: `<div class="field"><label>Current</label><input type="password" id="curPw" placeholder="Current password"></div>
    <div class="field"><label>New (min 4 chars)</label>
      <input type="password" id="newPw" placeholder="New password">
      <div class="pw-bar" id="pwBar"></div>
    </div>
    <div class="field"><label>Confirm</label><input type="password" id="confPw" placeholder="Repeat new password"></div>`,
    confirmText: 'Update',
  });
  if (res !== 'confirm') return;
  const cur = $('curPw')?.value || '', nw = $('newPw')?.value || '', conf = $('confPw')?.value || '';
  if (await sha256(cur) !== pwHash) { toast('✗ Wrong current password', 'err'); return; }
  if (nw.length < 4) { toast('✗ Min 4 characters', 'err'); return; }
  if (nw !== conf)   { toast('✗ Passwords don\'t match', 'err'); return; }
  pwHash = await sha256(nw); LS.set('pwHash', pwHash); toast('✓ Password updated', 'ok');
};
modal.addEventListener('input', e => {
  if (e.target.id !== 'newPw') return;
  const v = e.target.value, bar = $('pwBar'); if (!bar) return;
  bar.className = !v ? 'pw-bar' : v.length < 6 ? 'pw-bar weak' : v.length < 10 ? 'pw-bar medium' : 'pw-bar strong';
});

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 5: VIEW COUNTER (only counts viewer, not admin)
═══════════════════════════════════════════════════════ */
let views = LS.get('views', 0);
const sessionKey = 'viewedThisSession';
if (!sessionStorage.getItem(sessionKey)) {
  views++; LS.set('views', views); sessionStorage.setItem(sessionKey, '1');
}
$('viewCount').textContent = views;

/* ═══════════════════════════════════════════════════════
   PROFILE
═══════════════════════════════════════════════════════ */
function initProfile() {
  $('nickname').textContent  = profile.nickname;
  $('profession').textContent = profile.profession;
  $('bio').textContent       = profile.bio;
  if (profile.avatar) $('avatarImg').src = profile.avatar;
  if (profile.bg) $('profileBg').style.backgroundImage = `url(${profile.bg})`;
  updateAvail();
  updatePageMeta();
}
function updateAvail() {
  const b = $('availBadge');
  b.className = 'avail-pill ' + (profile.available ? 'avail--yes' : 'avail--no');
  $('availText').textContent = profile.available ? 'Online' : 'Offline';
}

/* IMPROVEMENT 6: EDIT with Ctrl+S save shortcut */
let editing = false;
$('editBtn').onclick = toggleEdit;
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 's' && editing) { e.preventDefault(); toggleEdit(); }
});
function toggleEdit() {
  editing = !editing;
  ['nickname', 'profession', 'bio'].forEach(id => {
    const el = $(id); if (!el) return;
    el.contentEditable = editing ? 'true' : 'false';
  });
  const btn = $('editBtn');
  btn.innerHTML = editing
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save`
    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
  if (!editing) {
    profile.nickname   = $('nickname').textContent.trim()  || 'Your Name';
    profile.profession = $('profession').textContent.trim() || '';
    profile.bio        = $('bio').textContent.trim()        || '';
    LS.set('profile', profile); updatePageMeta(); updateStats(); toast('✓ Profile saved', 'ok');
  } else {
    setTimeout(() => $('nickname').focus(), 50);
  }
}

/* background upload */
$('bgBtn').onclick = () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    /* IMPROVEMENT 7: client-side image resize before storing */
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        profile.bg = canvas.toDataURL('image/webp', 0.82);
        $('profileBg').style.backgroundImage = `url(${profile.bg})`;
        LS.set('profile', profile); toast('✓ Background updated', 'ok');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  };
  inp.click();
};
$('availBtn').onclick = () => {
  profile.available = !profile.available; LS.set('profile', profile);
  updateAvail(); toast(profile.available ? '✓ Available' : 'Unavailable');
};
$('avatarInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const s = Math.min(1, 400 / Math.max(img.width, img.height));
      canvas.width = img.width * s; canvas.height = img.height * s;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      profile.avatar = canvas.toDataURL('image/webp', 0.85);
      $('avatarImg').src = profile.avatar;
      LS.set('profile', profile); toast('✓ Avatar updated', 'ok');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

/* IMPROVEMENT 8: EXPORT JSON with timestamp */
$('exportBtn').onclick = () => {
  const data = { _exported: new Date().toISOString(), profile, contacts, skills, links, projects };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `profile-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('✓ Exported', 'ok');
};

/* IMPROVEMENT 9: subtle avatar parallax + 3D profile tilt (throttled) */
let rafPending = false;
document.addEventListener('mousemove', e => {
  if (rafPending) return; rafPending = true;
  requestAnimationFrame(() => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx, dy = (e.clientY - cy) / cy;
    // avatar parallax
    const aw = $('avatarWrap');
    if (aw) aw.style.transform = `translate(${dx * 5}px,${dy * 4}px)`;
    // profile card 3D tilt
    const ps = $('profileSection');
    if (ps) {
      const rx = dy * -4, ry = dx * 4;
      ps.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    }
    rafPending = false;
  });
}, { passive: true });
// Reset tilt when mouse leaves
document.addEventListener('mouseleave', () => {
  const ps = $('profileSection');
  if (ps) ps.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
  const aw = $('avatarWrap');
  if (aw) aw.style.transform = 'translate(0,0)';
});

/* ═══════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════ */
function updateStats() {
  countUp($('qs-skills'),   skills.length);
  countUp($('qs-projects'), projects.length);
  countUp($('qs-links'),    links.length);
  countUp($('qs-contacts'), contacts.length);

  // update count badges
  const pills = {
    'contacts-count': contacts.length,
    'skills-count':   skills.length,
    'links-count':    links.length,
    'portfolio-count':projects.length,
  };
  Object.entries(pills).forEach(([id, n]) => {
    const el = $(id); if (!el) return;
    el.textContent = n;
    el.style.opacity = n ? '1' : '.4';
  });
}

/* ═══════════════════════════════════════════════════════
   CONTACTS
═══════════════════════════════════════════════════════ */
const CICONS = { email:'📧', phone:'📞', telegram:'✈️', linkedin:'💼', twitter:'🐦', github:'💻', website:'🌐', other:'🔗' };

function renderContacts() {
  const g = $('contactsGrid');
  if (!contacts.length) {
    g.innerHTML = emptyState('📡', 'No contacts yet', isAdmin ? 'Click + Add to start' : '');
    return;
  }
  g.innerHTML = contacts.map((c, i) => `
    <div class="contact-item" data-ci="${i}" role="button" tabindex="0" title="${esc(c.value)}">
      <div class="contact-item__ico">${CICONS[c.type] || '🔗'}</div>
      <div style="flex:1;min-width:0">
        <div class="contact-item__type">${esc(c.type)}</div>
        <div class="contact-item__val">${esc(c.value)}</div>
      </div>
      ${isAdmin ? `<div class="contact-item__edit">
        <button class="icon-btn" data-cedit="${i}" title="Edit" aria-label="Edit contact">✎</button>
        <button class="icon-btn del" data-cdel="${i}" title="Delete" aria-label="Delete contact">✕</button>
      </div>` : ''}
    </div>`).join('');
}
$('contactsGrid').addEventListener('click', async e => {
  const cedit = e.target.closest('[data-cedit]');
  const cdel  = e.target.closest('[data-cdel]');
  const card  = e.target.closest('[data-ci]');

  if (cdel) {
    const i = +cdel.dataset.cdel;
    contacts.splice(i, 1); LS.set('contacts', contacts); renderContacts(); updateStats(); toast('Contact deleted');
    return;
  }
  if (cedit) {
    e.stopPropagation();
    const i = +cedit.dataset.cedit, c = contacts[i];
    const res = await openModal({ title: 'Edit Contact', fields: contactFields(c), confirmText: 'Save' });
    if (res !== 'confirm') return;
    const t = $('cType')?.value, v = $('cValue')?.value.trim();
    if (!t || !v) return;
    contacts[i] = { type: t, value: v }; LS.set('contacts', contacts); renderContacts(); toast('✓ Contact updated', 'ok'); return;
  }
  if (card && !isAdmin) {
    const c = contacts[+card.dataset.ci];
    let url = c.value;
    if (c.type === 'email')    url = 'mailto:' + c.value;
    else if (c.type === 'telegram') url = c.value.startsWith('http') ? c.value : 'https://t.me/' + c.value.replace('@', '');
    else if (c.type === 'phone')    url = 'tel:' + c.value;
    else if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (['email', 'phone', 'telegram'].includes(c.type)) {
      navigator.clipboard?.writeText(c.value).then(() => toast('✓ Copied!', 'ok'));
    } else { window.open(url, '_blank', 'noopener'); }
  }
});
function contactFields(c = {}) {
  const types = ['email','phone','telegram','linkedin','twitter','github','website','other'];
  return `<div class="field"><label>Type</label>
    <select id="cType">${types.map(t => `<option value="${t}"${c.type === t ? ' selected' : ''}>${CICONS[t]} ${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
  <div class="field"><label>Value</label><input type="text" id="cValue" placeholder="email, @handle, URL…" value="${esc(c.value || '')}"></div>`;
}
$('addContactBtn').onclick = async () => {
  const res = await openModal({ title: 'Add Contact', fields: contactFields(), confirmText: 'Add' });
  if (res !== 'confirm') return;
  const t = $('cType')?.value, v = $('cValue')?.value.trim();
  if (!t || !v) { toast('Fill all fields', 'err'); return; }
  contacts.push({ type: t, value: v }); LS.set('contacts', contacts); renderContacts(); updateStats(); toast('✓ Contact added', 'ok');
};

/* ═══════════════════════════════════════════════════════
   SKILLS
═══════════════════════════════════════════════════════ */
/* IMPROVEMENT 10: GRID/LIST toggle for skills */
let skillsGrid = false;
$('skillsViewBtn').onclick = () => {
  skillsGrid = !skillsGrid;
  const list = $('skillsList');
  list.classList.toggle('grid-view', skillsGrid);
  $('skillsViewBtn').textContent = skillsGrid ? '☰' : '⊞';
};

function renderSkills() {
  const list = $('skillsList');
  if (!skills.length) {
    list.innerHTML = emptyState('⚡', 'No skills listed', isAdmin ? 'Add skills to showcase expertise' : '');
    return;
  }
  list.innerHTML = skills.map((s, i) => `
    <div class="skill-row" data-si="${i}">
      <div class="skill-row__top">
        <div class="skill-row__left">
          <span class="skill-row__emoji" aria-hidden="true">${esc(s.emoji || '⚡')}</span>
          <div>
            <div class="skill-row__name">${esc(s.name)}</div>
            ${s.cat ? `<div class="skill-row__cat">${esc(s.cat)}</div>` : ''}
          </div>
        </div>
        <div class="skill-row__right">
          <span class="skill-row__pct">${s.level}%</span>
          ${isAdmin ? `<div class="skill-row__edit">
            <button class="icon-btn" data-sedit="${i}" aria-label="Edit skill">✎</button>
            <button class="icon-btn del" data-sdel="${i}" aria-label="Delete skill">✕</button>
          </div>` : ''}
        </div>
      </div>
      <div class="skill-bar" role="progressbar" aria-valuenow="${s.level}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(s.name)} proficiency">
        <div class="skill-bar__fill" style="--w:${s.level}%;--delay:${i * 0.07}s"></div>
      </div>
    </div>`).join('');

  // animate bars after paint
  requestAnimationFrame(() => requestAnimationFrame(() => {
    list.querySelectorAll('.skill-bar__fill').forEach(b => b.classList.add('on'));
  }));
}
$('skillsList').addEventListener('click', async e => {
  const sedit = e.target.closest('[data-sedit]'), sdel = e.target.closest('[data-sdel]');
  if (sdel) {
    const i = +sdel.dataset.sdel; skills.splice(i, 1); LS.set('skills', skills); renderSkills(); updateStats(); toast('Skill deleted'); return;
  }
  if (sedit) {
    const i = +sedit.dataset.sedit;
    const res = await openModal({ title: 'Edit Skill', fields: skillFields(skills[i]), confirmText: 'Save' });
    if (res !== 'confirm') return;
    const s = collectSkill(); if (!s) return;
    skills[i] = s; LS.set('skills', skills); renderSkills(); toast('✓ Skill updated', 'ok');
  }
});
function skillFields(s = {}) {
  return `<div class="field-row">
    <div class="field"><label>Emoji</label><input type="text" id="sEmoji" placeholder="⚡" maxlength="4" value="${esc(s.emoji || '')}"></div>
    <div class="field"><label>Category</label><input type="text" id="sCat" placeholder="Frontend" maxlength="28" value="${esc(s.cat || '')}"></div>
  </div>
  <div class="field"><label>Skill Name</label><input type="text" id="sName" placeholder="e.g. React" maxlength="40" value="${esc(s.name || '')}"></div>
  <div class="field"><label>Proficiency %</label><input type="range" id="sLevel" min="0" max="100" step="5" value="${s.level ?? 80}" oninput="$('sLevelVal').textContent=this.value+'%'">
    <span class="field-hint" id="sLevelVal">${(s.level ?? 80)}%</span></div>`;
}
function collectSkill() {
  const name = $('sName')?.value.trim(); if (!name) return null;
  return { name, emoji: $('sEmoji')?.value.trim() || '⚡', cat: $('sCat')?.value.trim() || '', level: +($('sLevel')?.value ?? 80) };
}
$('addSkillBtn').onclick = async () => {
  const res = await openModal({ title: 'Add Skill', fields: skillFields(), confirmText: 'Add' });
  if (res !== 'confirm') return;
  const s = collectSkill(); if (!s) { toast('Name required', 'err'); return; }
  skills.push(s); LS.set('skills', skills); renderSkills(); updateStats(); toast('✓ Skill added', 'ok');
};

/* ═══════════════════════════════════════════════════════
   LINKS  –  with drag-to-reorder + click tracking + search + sort
═══════════════════════════════════════════════════════ */
let linksFilter = '', linksSort = 'custom';

$('linksSearch').addEventListener('input', debounce(e => { linksFilter = e.target.value.toLowerCase(); renderLinks(); }, 180));
$('linksSort').addEventListener('change', e => { linksSort = e.target.value; renderLinks(); });

function renderLinks() {
  const list = $('linksList');
  let data = links.map((l, i) => ({ ...l, _i: i }));
  if (linksFilter) data = data.filter(l => l.name.toLowerCase().includes(linksFilter) || l.url.toLowerCase().includes(linksFilter));
  if (linksSort === 'az') data.sort((a, b) => a.name.localeCompare(b.name));
  else if (linksSort === 'za') data.sort((a, b) => b.name.localeCompare(a.name));
  else if (linksSort === 'clicks') data.sort((a, b) => (linkClicks[b._i] || 0) - (linkClicks[a._i] || 0));

  if (!data.length) {
    list.innerHTML = `<li>${emptyState('🔗', linksFilter ? 'No results' : 'No links yet', isAdmin && !linksFilter ? 'Add your first link' : '')}</li>`;
    return;
  }
  list.innerHTML = '';
  data.forEach(l => {
    const clicks = linkClicks[l._i] || 0;
    const li = document.createElement('li');
    li.className = 'link-item';
    li.setAttribute('data-li', l._i);
    if (isAdmin) { li.setAttribute('draggable', 'true'); }
    li.innerHTML = `
      ${isAdmin ? `<span class="link-item__drag" title="Drag to reorder" aria-hidden="true">⠿⠿</span>` : ''}
      <div class="link-item__ico" aria-hidden="true">${esc(l.name.slice(0, 2).toUpperCase())}</div>
      <div class="link-item__info">
        <div class="link-item__name">${esc(l.name)}</div>
        <div class="link-item__url">${esc(l.url)}</div>
      </div>
      ${clicks > 0 ? `<span class="link-item__clicks" title="Click count">${clicks}</span>` : ''}
      <div class="link-item__actions">
        <button class="icon-btn" data-lopen="${l._i}" title="Open link" aria-label="Open ${esc(l.name)}">↗</button>
        ${isAdmin ? `<button class="icon-btn" data-ledit="${l._i}" aria-label="Edit">✎</button>
        <button class="icon-btn del" data-ldel="${l._i}" aria-label="Delete">✕</button>` : ''}
      </div>`;
    list.appendChild(li);
  });
  if (isAdmin) initLinkDrag();
}

$('linksList').addEventListener('click', async e => {
  const lopen = e.target.closest('[data-lopen]');
  const ledit = e.target.closest('[data-ledit]');
  const ldel  = e.target.closest('[data-ldel]');
  if (lopen) {
    const i = +lopen.dataset.lopen;
    let u = links[i].url; if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    linkClicks[i] = (linkClicks[i] || 0) + 1; LS.set('linkClicks', linkClicks);
    window.open(u, '_blank', 'noopener'); renderLinks(); return;
  }
  if (ldel) {
    const i = +ldel.dataset.ldel;
    const li = $('linksList').querySelector(`[data-li="${i}"]`);
    if (li) { li.classList.add('removing'); li.addEventListener('animationend', () => { links.splice(i, 1); LS.set('links', links); renderLinks(); updateStats(); }, { once: true }); }
    toast('Link deleted'); return;
  }
  if (ledit) {
    const i = +ledit.dataset.ledit;
    const res = await openModal({ title: 'Edit Link', fields: linkFields(links[i]), confirmText: 'Save' });
    if (res !== 'confirm') return;
    const n = $('lName')?.value.trim(), u = $('lUrl')?.value.trim(); if (!n || !u) return;
    links[i] = { name: n, url: u }; LS.set('links', links); renderLinks(); toast('✓ Link updated', 'ok');
  }
});
function linkFields(l = {}) {
  return `<div class="field"><label>Name</label><input type="text" id="lName" placeholder="e.g. GitHub" maxlength="40" value="${esc(l.name || '')}"></div>
  <div class="field"><label>URL</label><input type="url" id="lUrl" placeholder="https://…" value="${esc(l.url || '')}"></div>`;
}
$('addLinkBtn').onclick = async () => {
  const res = await openModal({ title: 'Add Link', fields: linkFields(), confirmText: 'Add' });
  if (res !== 'confirm') return;
  const n = $('lName')?.value.trim(), u = $('lUrl')?.value.trim();
  if (!n || !u) { toast('Fill all fields', 'err'); return; }
  links.push({ name: n, url: u }); LS.set('links', links); renderLinks(); updateStats(); toast('✓ Link added', 'ok');
};

/* IMPROVEMENT 11: DRAG-TO-REORDER with visual feedback */
let dragSrc = null;
function initLinkDrag() {
  document.querySelectorAll('.link-item[draggable]').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = +item.dataset.li;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.classList.add('drag-src'), 0);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('drag-src');
      document.querySelectorAll('.link-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.link-item').forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('drop', e => {
      e.preventDefault(); item.classList.remove('drag-over');
      const target = +item.dataset.li;
      if (dragSrc === null || dragSrc === target) return;
      const moved = links.splice(dragSrc, 1)[0]; links.splice(target, 0, moved);
      LS.set('links', links); renderLinks(); dragSrc = null;
    });
  });
}

/* ═══════════════════════════════════════════════════════
   PORTFOLIO  –  with LIGHTBOX detail view
═══════════════════════════════════════════════════════ */
function renderPortfolio() {
  const g = $('portfolioGrid');
  if (!projects.length) {
    g.innerHTML = emptyState('🗂', 'No projects yet', isAdmin ? 'Add your best work' : '');
    return;
  }
  g.innerHTML = projects.map((p, i) => `
    <div class="project-card" data-pi="${i}" role="button" tabindex="0" aria-label="${esc(p.title)}">
      <div class="project-card__thumb">
        <span aria-hidden="true">${esc(p.emoji || '🚀')}</span>
        <div class="project-card__thumb-overlay" aria-hidden="true"></div>
        ${isAdmin ? `<div class="project-card__admin">
          <button class="icon-btn" data-pedit="${i}" aria-label="Edit project">✎</button>
          <button class="icon-btn del" data-pdel="${i}" aria-label="Delete project">✕</button>
        </div>` : ''}
      </div>
      <div class="project-card__body">
        <div class="project-card__title">${esc(p.title)}</div>
        <div class="project-card__desc">${esc(p.desc || '')}</div>
        ${p.tags?.length ? `<div class="project-card__tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    </div>`).join('');
}

/* IMPROVEMENT 12: LIGHTBOX for project details */
$('portfolioGrid').addEventListener('click', async e => {
  const pedit = e.target.closest('[data-pedit]'), pdel = e.target.closest('[data-pdel]'), card = e.target.closest('[data-pi]');
  if (pdel) {
    const i = +pdel.dataset.pdel; projects.splice(i, 1); LS.set('projects', projects); renderPortfolio(); updateStats(); toast('Project deleted'); return;
  }
  if (pedit) {
    e.stopPropagation();
    const i = +pedit.dataset.pedit;
    const res = await openModal({ title: 'Edit Project', fields: projectFields(projects[i]), confirmText: 'Save' });
    if (res !== 'confirm') return;
    const p = collectProject(); if (!p) return;
    projects[i] = p; LS.set('projects', projects); renderPortfolio(); toast('✓ Updated', 'ok'); return;
  }
  if (card) {
    const p = projects[+card.dataset.pi]; if (!isAdmin) openLightbox(p);
  }
});
function openLightbox(p) {
  const lb = $('lightbox'), box = $('lightboxBox'); if (!lb || !box) return;
  box.innerHTML = `
    <div class="lightbox__emoji">${esc(p.emoji || '🚀')}</div>
    <div class="lightbox__body">
      <div class="lightbox__title">${esc(p.title)}</div>
      <div class="lightbox__desc">${esc(p.desc || 'No description.')}</div>
      ${p.tags?.length ? `<div class="lightbox__tags">${p.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${p.url ? `<a class="lightbox__url" href="${esc(p.url)}" target="_blank" rel="noopener">Open Project ↗</a>` : ''}
    </div>
    <button class="icon-btn lightbox__close" id="lbClose" aria-label="Close">✕</button>`;
  lb.classList.remove('hidden');
  $('lbClose').onclick = closeLightbox;
  $('lightboxBackdrop').onclick = closeLightbox;
}
function closeLightbox() { $('lightbox').classList.add('hidden'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

function projectFields(p = {}) {
  return `<div class="field-row">
    <div class="field"><label>Emoji</label><input type="text" id="pEmoji" placeholder="🚀" maxlength="4" value="${esc(p.emoji || '')}"></div>
    <div class="field"><label>URL</label><input type="url" id="pUrl" placeholder="https://…" value="${esc(p.url || '')}"></div>
  </div>
  <div class="field"><label>Title</label><input type="text" id="pTitle" placeholder="Project name" maxlength="60" value="${esc(p.title || '')}"></div>
  <div class="field"><label>Description</label><textarea id="pDesc" rows="3" placeholder="Short description…">${esc(p.desc || '')}</textarea></div>
  <div class="field"><label>Tags <span class="field-hint">(comma separated, max 4)</span></label>
    <input type="text" id="pTags" placeholder="React, TypeScript…" value="${esc((p.tags || []).join(', '))}"></div>`;
}
function collectProject() {
  const title = $('pTitle')?.value.trim(); if (!title) return null;
  const tags = ($('pTags')?.value || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 4);
  return { title, emoji: $('pEmoji')?.value.trim() || '🚀', desc: $('pDesc')?.value.trim() || '', url: $('pUrl')?.value.trim() || '', tags };
}
$('addProjectBtn').onclick = async () => {
  const res = await openModal({ title: 'Add Project', fields: projectFields(), confirmText: 'Add' });
  if (res !== 'confirm') return;
  const p = collectProject(); if (!p) { toast('Title required', 'err'); return; }
  projects.push(p); LS.set('projects', projects); renderPortfolio(); updateStats(); toast('✓ Project added', 'ok');
};

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 13: SHARE DRAWER with native Web Share
═══════════════════════════════════════════════════════ */
function openShare() {
  const d = $('shareDrawer'); if (!d) return;
  d.classList.remove('hidden');
  // populate OG preview
  const ogImg = $('ogImg');
  if (profile.avatar) {
    ogImg.innerHTML = '';
    const img = new Image(); img.src = profile.avatar;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    ogImg.appendChild(img);
  } else { ogImg.textContent = '👤'; }
  $('ogName').textContent = profile.nickname;
  $('ogRole').textContent = profile.profession;
  const ob = $('ogBadge');
  ob.className = 'avail-pill ' + (profile.available ? 'avail--yes' : 'avail--no');
  ob.innerHTML = `<span class="avail-dot"></span><div class="avail-toggle" aria-hidden="true"><div class="avail-thumb"></div></div> ${profile.available ? 'Online' : 'Offline'}`;
}
function closeShare() { $('shareDrawer').classList.add('hidden'); }
$('shareBtn').onclick = openShare;
$('shareClose').onclick = $('shareBackdrop').onclick = closeShare;
$('shareCopyBtn').onclick = () => {
  navigator.clipboard?.writeText(location.href).then(() => { toast('✓ Link copied!', 'ok'); closeShare(); });
};
$('shareNativeBtn').onclick = () => {
  if (navigator.share) {
    navigator.share({ title: profile.nickname, text: profile.bio, url: location.href }).catch(() => {});
    closeShare();
  } else {
    navigator.clipboard?.writeText(location.href).then(() => { toast('✓ Link copied!', 'ok'); closeShare(); });
  }
};

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 14: INTERSECTION OBSERVER with stagger
═══════════════════════════════════════════════════════ */
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
  });
}, { threshold: .06, rootMargin: '0px 0px -20px 0px' });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ═══════════════════════════════════════════════════════
   IMPROVEMENT 15: KEYBOARD SHORTCUTS help
═══════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (!isAdmin) return;
  if (e.key === '?' && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    toast('Shortcuts: Ctrl+S = save edit  ·  ? = this help  ·  Esc = close', '');
  }
});

/* ═══════════════════════════════════════════════════════
   EMPTY STATE HELPER
═══════════════════════════════════════════════════════ */
function emptyState(icon, text, sub = '') {
  return `<div class="empty">
    <div class="empty__icon">${icon}</div>
    <div class="empty__text">${text}</div>
    ${sub ? `<div class="empty__sub">${sub}</div>` : ''}
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   RENDER ALL + BOOT
═══════════════════════════════════════════════════════ */
function renderAll() {
  renderContacts();
  renderSkills();
  renderLinks();
  renderPortfolio();
  updateStats();
}

// boot
initProfile();
if (LS.get('adminSession', '0') === '1') { isAdmin = true; applyAdminUI(); }
else applyAdminUI();

})();
