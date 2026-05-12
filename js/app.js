/* ================================================================
   Casa GM — app.js
   All UI logic. Uses `sb` and `DB` from auth.js (loaded after this).
   ================================================================ */

const APP_VERSION = '2.2';

// ── Utilities ──────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function fmtDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function isOverdue(d) { return !!d && d < today(); }

function greet() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function personColor(p) {
  return p === 'me' ? '#1a2e5a' : p === 'partner' ? '#7c3aed' : '#10b981';
}

function catColor(c) {
  const m = { medical:'#ef4444', legal:'#3b82f6', insurance:'#10b981',
               school:'#f59e0b', financial:'#8b5cf6', home:'#06b6d4', other:'#6b7280' };
  return m[c] || '#6b7280';
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function settings() {
  try { return JSON.parse(localStorage.getItem('cgm_settings')) || { name1:'Brian', name2:'Lindsay', family:'Guerra' }; }
  catch { return { name1:'Brian', name2:'Lindsay', family:'Guerra' }; }
}
function saveSettings(s) { localStorage.setItem('cgm_settings', JSON.stringify(s)); }

// ── Modal / Bottom Sheet ───────────────────────────────────────────
const Modal = {
  el: null,
  init() {
    this.el = document.getElementById('modal-overlay');
    this.el.addEventListener('click', e => { if (e.target === this.el) this.hide(); });
  },
  show({ title, body }) {
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = body;
    this.el.classList.add('open');
    setTimeout(() => {
      const f = document.getElementById('sheet-body').querySelector('input:not([type=date]):not([type=time]), textarea');
      if (f) f.focus();
    }, 380);
  },
  hide() { this.el.classList.remove('open'); }
};

// ── Home ───────────────────────────────────────────────────────────
const Home = {
  render() {
    const s    = settings();
    const t    = today();
    const now  = new Date();
    const evts = DB.list('events');
    const rems = DB.list('reminders');
    const pName = p => p === 'me' ? s.name1 : p === 'partner' ? s.name2 : 'Family';

    // End of this week (Sunday) and end of this month
    const weekEnd = (() => {
      const d = new Date(now);
      const diff = d.getDay() === 0 ? 0 : 7 - d.getDay();
      d.setDate(d.getDate() + diff);
      return d.toISOString().split('T')[0];
    })();
    const afterWeek = (() => {
      const d = new Date(weekEnd + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString().split('T')[0];
    const tomorrow = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split('T')[0];
    })();

    const mkEvt = e => ({
      date: e.date, time: e.time || '',
      title: e.title,
      sub: [e.time ? fmtTime(e.time) : '', pName(e.person), e.location].filter(Boolean).join(' · '),
      dot: personColor(e.person), overdue: false,
      go: "App.go('calendar')"
    });
    const mkRem = r => ({
      date: r.due_date || '9999-12-31', time: '',
      title: r.title,
      sub: [r.due_date ? fmtDate(r.due_date) : 'No due date',
            r.assignee && r.assignee !== 'both' ? pName(r.assignee) : ''].filter(Boolean).join(' · '),
      dot: isOverdue(r.due_date) ? '#ef4444' : '#7c3aed',
      overdue: isOverdue(r.due_date),
      go: "App.go('reminders')"
    });

    const sort = arr => arr.sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    const todayItems = sort([
      ...evts.filter(e => e.date === t).map(mkEvt),
      ...rems.filter(r => !r.done && r.due_date <= t && r.due_date).map(mkRem)
    ]);
    const weekItems = sort([
      ...evts.filter(e => e.date >= tomorrow && e.date <= weekEnd).map(mkEvt),
      ...rems.filter(r => !r.done && r.due_date >= tomorrow && r.due_date <= weekEnd).map(mkRem)
    ]);
    const monthItems = sort([
      ...evts.filter(e => e.date >= afterWeek && e.date <= monthEnd).map(mkEvt),
      ...rems.filter(r => !r.done && r.due_date >= afterWeek && r.due_date <= monthEnd).map(mkRem)
    ]);

    const row = item => `
      <div class="feed-item" onclick="${item.go}">
        <div class="feed-dot${item.overdue ? ' feed-dot-overdue' : ''}" style="background:${item.dot}"></div>
        <div class="feed-body">
          <div class="feed-title">${esc(item.title)}</div>
          <div class="feed-sub">${esc(item.sub)}${item.overdue ? ' &middot; <span class="overdue-tag">Overdue</span>' : ''}</div>
        </div>
      </div>`;

    const group = (label, items) => !items.length ? '' : `
      <div class="time-group">
        <div class="time-label">${label}</div>
        ${items.map(row).join('')}
      </div>`;

    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const allClear = !todayItems.length && !weekItems.length && !monthItems.length;

    document.getElementById('section-home').innerHTML = `
      <div class="home-bar">
        <div class="home-bar-left">
          <div class="home-bar-name">Casa ${esc(s.family)}</div>
          <div class="home-bar-greet">${greet()}</div>
        </div>
        <div class="home-bar-right">
          <div class="home-bar-date">${dateStr}</div>
          <button class="home-bell" id="home-bell-btn" onclick="NotifInbox.show()">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>
          <button class="home-gear" onclick="More.showSettings()">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="home-actions">
        <button class="qa-btn primary" onclick="Cal.addModal()">＋ Event</button>
        <button class="qa-btn secondary" onclick="Tasks.addModal()">＋ Reminder</button>
      </div>
      <div class="home-feed">
        ${group('Today', todayItems)}
        ${group('This Week', weekItems)}
        ${group('This Month', monthItems)}
        ${allClear ? `
          <div class="empty">
            <div class="empty-icon">🏡</div>
            <div class="empty-title">All clear!</div>
            <div class="empty-sub">Nothing on the schedule this month.<br>Tap ＋ to add an event or reminder.</div>
          </div>` : ''}
      </div>`;
  }
};

// ── Documents ──────────────────────────────────────────────────────
const CATS = [
  { id:'all',       label:'All',       emoji:'📋' },
  { id:'medical',   label:'Medical',   emoji:'🏥' },
  { id:'legal',     label:'Legal',     emoji:'⚖️' },
  { id:'insurance', label:'Insurance', emoji:'🛡️' },
  { id:'school',    label:'School',    emoji:'🎓' },
  { id:'financial', label:'Financial', emoji:'💰' },
  { id:'home',      label:'Home',      emoji:'🏠' },
  { id:'other',     label:'Other',     emoji:'📁' },
];

const Docs = {
  cat: 'all',
  q: '',
  render() {
    const all  = DB.list('docs');
    const list = all.filter(d => {
      const mc = this.cat === 'all' || d.category === this.cat;
      const mq = !this.q || d.name.toLowerCase().includes(this.q.toLowerCase());
      return mc && mq;
    });
    const cat = id => CATS.find(c => c.id === id) || CATS[CATS.length-1];

    document.getElementById('section-docs').innerHTML = `
      <div class="section-header">
        <h1>Documents</h1>
        <button class="header-btn" onclick="Docs.addModal()">＋</button>
      </div>
      <div class="section-content">
        <input type="search" class="doc-search" placeholder="Search documents…"
               value="${esc(this.q)}" oninput="Docs.search(this.value)" />
        <div class="chips">
          ${CATS.map(c => `
            <button class="chip ${this.cat===c.id?'active':''}" onclick="Docs.setCat('${c.id}')">
              ${c.label}
            </button>`).join('')}
        </div>
        ${list.length ? list.map(d => {
          const c = cat(d.category);
          return `
            <div class="doc-item" onclick="Docs.open('${d.id}')">
              <div class="doc-icon" style="background:${catColor(d.category)}18">${c.emoji}</div>
              <div class="doc-info">
                <div class="doc-name">${esc(d.name)}</div>
                <div class="doc-meta">${c.label} · ${new Date(d.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
              </div>
              <div class="doc-chevron">›</div>
            </div>`;
        }).join('') : `
          <div class="empty">
            <div class="empty-icon">📄</div>
            <div class="empty-title">${all.length ? 'No results' : 'No documents yet'}</div>
            <div class="empty-sub">${all.length ? 'Try a different filter.' : 'Tap ＋ to add a link or upload a file.'}</div>
          </div>`}
      </div>`;
  },
  search(v) { this.q = v; this.render(); },
  setCat(c)  { this.cat = c; this.render(); },
  open(id) {
    const d = DB.list('docs').find(x => x.id === id);
    if (!d) return;
    if (d.type === 'link' && d.url) { window.open(d.url, '_blank'); return; }
    if (d.type === 'file' && d.file_data) {
      const w = window.open();
      w.document.write(`<iframe src="${d.file_data}" style="width:100%;height:100%;border:none;margin:0"></iframe>`);
      return;
    }
    Modal.show({
      title: d.name,
      body: `
        <div class="fg">
          <div><strong>Category:</strong> ${esc(d.category)}</div>
          ${d.notes ? `<div><strong>Notes:</strong> ${esc(d.notes)}</div>` : ''}
          <div><strong>Added:</strong> ${new Date(d.created_at).toLocaleDateString()}</div>
        </div>
        <button class="btn-save btn-danger mt8" onclick="Docs.del('${id}')">Delete Document</button>`
    });
  },
  async del(id) {
    if (!confirm('Delete this document?')) return;
    await DB.remove('docs', id);
    Modal.hide();
    this.render();
  },
  addModal() {
    Modal.show({
      title: 'Add Document',
      body: `
        <div class="fg">
          <label class="fl">Name</label>
          <input class="fi" id="d-name" placeholder="e.g. Grant's Birth Certificate" />
        </div>
        <div class="fg">
          <label class="fl">Category</label>
          <select class="fi fi-select" id="d-cat">
            ${CATS.filter(c=>c.id!=='all').map(c=>`<option value="${c.id}">${c.emoji} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="fg">
          <label class="fl">Type</label>
          <select class="fi fi-select" id="d-type" onchange="Docs._typeToggle()">
            <option value="link">🔗 Link / URL</option>
            <option value="file">📎 File Upload</option>
          </select>
        </div>
        <div class="fg" id="d-url-wrap">
          <label class="fl">URL</label>
          <input type="url" class="fi" id="d-url" placeholder="https://…" />
        </div>
        <div class="fg hidden" id="d-file-wrap">
          <label class="fl">File</label>
          <input type="file" class="fi" id="d-file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
          <div class="hint mt4">Stored in the cloud. PDF, image, or Word doc.</div>
        </div>
        <div class="fg">
          <label class="fl">Notes (optional)</label>
          <textarea class="fi" id="d-notes" rows="2" placeholder="Any relevant notes…"></textarea>
        </div>
        <button class="btn-save" onclick="Docs.save()">Add Document</button>`
    });
  },
  _typeToggle() {
    const t = document.getElementById('d-type').value;
    document.getElementById('d-url-wrap').classList.toggle('hidden', t !== 'link');
    document.getElementById('d-file-wrap').classList.toggle('hidden', t !== 'file');
  },
  async save() {
    const name = document.getElementById('d-name').value.trim();
    const cat  = document.getElementById('d-cat').value;
    const type = document.getElementById('d-type').value;
    const note = document.getElementById('d-notes').value.trim();
    if (!name) return alert('Please enter a document name.');

    if (type === 'link') {
      const url = document.getElementById('d-url').value.trim();
      await DB.add('docs', { name, category: cat, type, url, notes: note });
      Modal.hide(); this.render();
    } else {
      const file = document.getElementById('d-file').files[0];
      if (!file) return alert('Please choose a file.');
      const reader = new FileReader();
      reader.onload = async e => {
        await DB.add('docs', { name, category: cat, type, notes: note,
          file_data: e.target.result, file_name: file.name, file_type: file.type });
        Modal.hide(); this.render();
      };
      reader.readAsDataURL(file);
    }
  }
};

// ── Calendar ───────────────────────────────────────────────────────
const Cal = {
  y: new Date().getFullYear(),
  m: new Date().getMonth(),
  sel: today(),
  MONTHS: ['January','February','March','April','May','June',
           'July','August','September','October','November','December'],

  render() {
    document.getElementById('section-calendar').innerHTML = `
      <div class="section-header">
        <h1>Calendar</h1>
        <button class="header-btn" onclick="Cal.addModal()">＋</button>
      </div>
      <div class="section-content">
        <div class="card">${this._grid()}</div>
        <div class="card" id="cal-day-card">${this._dayEvents()}</div>
      </div>`;
  },

  _grid() {
    const events   = DB.list('events');
    const t        = today();
    const days     = new Date(this.y, this.m+1, 0).getDate();
    const firstDay = new Date(this.y, this.m, 1).getDay();

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= days; d++) {
      const ds   = `${this.y}-${String(this.m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const evts = events.filter(e => e.date === ds);
      const isT  = ds === t;
      const isSel = ds === this.sel;
      cells += `
        <div class="cal-day${isT?' today':''}${isSel&&!isT?' selected':''}" onclick="Cal.pick('${ds}')">
          <span class="cal-day-num">${d}</span>
          ${evts.length ? `<div class="cal-dots">${evts.slice(0,3).map(e=>`<span class="cal-dot" style="background:${personColor(e.person)}"></span>`).join('')}</div>` : ''}
        </div>`;
    }
    return `
      <div class="cal-nav">
        <button onclick="Cal.prev()">‹</button>
        <span class="month-label">${this.MONTHS[this.m]} ${this.y}</span>
        <button onclick="Cal.next()">›</button>
      </div>
      <div class="cal-day-headers">
        ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>`<div class="cal-dh">${d}</div>`).join('')}
      </div>
      <div class="cal-days">${cells}</div>`;
  },

  _dayEvents() {
    const s    = settings();
    const evts = DB.list('events').filter(e => e.date === this.sel)
                  .sort((a,b) => (a.time||'').localeCompare(b.time||''));
    const label = this.sel === today() ? 'Today' : fmtDate(this.sel);
    const pName = p => p === 'me' ? s.name1 : p === 'partner' ? s.name2 : 'Family';

    if (!evts.length) return `
      <div class="day-label">${label}</div>
      <div class="empty" style="padding:20px 0">
        <div class="empty-sub">No events · <button onclick="Cal.addModal()" style="background:none;border:none;color:var(--navy);font-weight:700;font-size:13px">Add one</button></div>
      </div>`;

    return `
      <div class="day-label">${label}</div>
      ${evts.map(e => `
        <div class="event-item">
          <div class="event-bar" style="background:${personColor(e.person)}"></div>
          <div class="event-info">
            <div class="event-title">${esc(e.title)}</div>
            <div class="event-meta">${e.all_day ? 'All day' : e.time ? fmtTime(e.time) : ''} · ${esc(pName(e.person))}${e.location ? ' · 📍' + esc(e.location) : ''}</div>
          </div>
          <button class="event-del" onclick="Cal.del('${e.id}')">×</button>
        </div>`).join('')}`;
  },

  pick(ds) {
    this.sel = ds;
    document.getElementById('cal-day-card').innerHTML = this._dayEvents();
    document.querySelectorAll('.cal-day').forEach(el => {
      const isThis  = (el.getAttribute('onclick') || '').includes(`'${ds}'`);
      const isToday = el.classList.contains('today');
      el.classList.toggle('selected', isThis && !isToday);
    });
  },
  prev() { this.m === 0 ? (this.m=11, this.y--) : this.m--; this.render(); },
  next() { this.m === 11 ? (this.m=0, this.y++) : this.m++; this.render(); },
  async del(id) { await DB.remove('events', id); this.render(); Home.render(); },

  addModal() {
    const s = settings();
    Modal.show({
      title: 'Add Event',
      body: `
        <div class="fg">
          <label class="fl">Title</label>
          <input class="fi" id="e-title" placeholder="Event name" />
        </div>
        <div class="fg">
          <label class="fl">Date</label>
          <input type="date" class="fi" id="e-date" value="${this.sel || today()}" />
        </div>
        <div class="fg">
          <label class="fl">All day?</label>
          <select class="fi fi-select" id="e-allday" onchange="Cal._timeToggle()">
            <option value="1">Yes — all day</option>
            <option value="0">No — pick a time</option>
          </select>
        </div>
        <div class="fg hidden" id="e-time-wrap">
          <label class="fl">Time</label>
          <input type="time" class="fi" id="e-time" />
        </div>
        <div class="fg">
          <label class="fl">For</label>
          <select class="fi fi-select" id="e-person">
            <option value="family">👨‍👩‍👧‍👦 Family</option>
            <option value="me">👤 ${esc(s.name1)}</option>
            <option value="partner">👤 ${esc(s.name2)}</option>
          </select>
        </div>
        <div class="fg">
          <label class="fl">Location (optional)</label>
          <input class="fi" id="e-loc" placeholder="Where?" />
        </div>
        <div class="fg">
          <label class="fl">Notes (optional)</label>
          <textarea class="fi" id="e-notes" rows="2" placeholder="Details…"></textarea>
        </div>
        <button class="btn-save" onclick="Cal.save()">Add Event</button>`
    });
  },
  _timeToggle() {
    document.getElementById('e-time-wrap').classList.toggle('hidden',
      document.getElementById('e-allday').value === '1');
  },
  async save() {
    const title  = document.getElementById('e-title').value.trim();
    const date   = document.getElementById('e-date').value;
    const allDay = document.getElementById('e-allday').value === '1';
    if (!title) return alert('Please enter an event title.');
    if (!date)  return alert('Please pick a date.');
    await DB.add('events', {
      title, date, all_day: allDay,
      time:     allDay ? null : document.getElementById('e-time').value,
      person:   document.getElementById('e-person').value,
      location: document.getElementById('e-loc').value.trim(),
      notes:    document.getElementById('e-notes').value.trim()
    });
    Modal.hide();
    this.sel = date;
    this.y = +date.slice(0,4);
    this.m = +date.slice(5,7) - 1;
    this.render();
    Home.render();
  }
};

// ── Reminders / Tasks ──────────────────────────────────────────────
const Tasks = {
  showDone: false,
  render() {
    const s    = settings();
    const t    = today();
    const all  = DB.list('reminders');
    const open = all.filter(r => !r.done);
    const done = all.filter(r =>  r.done);
    const overdue  = open.filter(r => isOverdue(r.due_date));
    const dueToday = open.filter(r => r.due_date === t);
    const upcoming = open.filter(r => !r.due_date || r.due_date > t);
    const pName = p => p === 'me' ? s.name1 : p === 'partner' ? s.name2 : 'Both';

    const item = r => {
      const od   = isOverdue(r.due_date) && !r.done;
      const name = r.assignee ? pName(r.assignee) : '';
      return `
        <div class="rem-item${r.done?' done':''}">
          <div class="rem-check${r.done?' checked':''}" onclick="Tasks.toggle('${r.id}')">${r.done?'✓':''}</div>
          <div class="rem-info">
            <div class="rem-title">${esc(r.title)}</div>
            <div class="rem-meta">
              ${r.due_date ? `<span class="rem-tag${od?' overdue':''}">${od?'⚠ ':''}${fmtDate(r.due_date)}</span>` : ''}
              ${name ? `<span class="rem-tag">${esc(name)}</span>` : ''}
              ${r.category ? `<span class="rem-tag">${esc(r.category)}</span>` : ''}
            </div>
          </div>
          <button class="rem-del" onclick="Tasks.del('${r.id}')">×</button>
        </div>`;
    };

    document.getElementById('section-reminders').innerHTML = `
      <div class="section-header">
        <h1>Reminders</h1>
        <button class="header-btn" onclick="Tasks.addModal()">＋</button>
      </div>
      <div class="section-content">
        ${overdue.length  ? `<div><div class="rem-section-title" style="color:var(--red)">⚠ Overdue (${overdue.length})</div>${overdue.map(item).join('')}</div>` : ''}
        ${dueToday.length ? `<div><div class="rem-section-title">Due Today (${dueToday.length})</div>${dueToday.map(item).join('')}</div>` : ''}
        ${upcoming.length ? `<div><div class="rem-section-title">Upcoming</div>${upcoming.sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).map(item).join('')}</div>` : ''}
        ${!open.length ? `
          <div class="empty">
            <div class="empty-icon">✅</div>
            <div class="empty-title">All clear!</div>
            <div class="empty-sub">No open reminders.<br>Tap ＋ to add one.</div>
          </div>` : ''}
        ${done.length ? `
          <div>
            <button class="toggle-completed" onclick="Tasks._toggleDone()">
              ${this.showDone ? '▾' : '▸'} Completed (${done.length})
            </button>
            ${this.showDone ? done.map(item).join('') : ''}
          </div>` : ''}
      </div>`;
  },
  async toggle(id) {
    const r = DB.list('reminders').find(x => x.id === id);
    if (r) await DB.update('reminders', id, { done: !r.done, done_at: !r.done ? new Date().toISOString() : null });
    this.render(); Home.render();
  },
  async del(id) { await DB.remove('reminders', id); this.render(); Home.render(); },
  _toggleDone() { this.showDone = !this.showDone; this.render(); },
  addModal() {
    const s = settings();
    Modal.show({
      title: 'Add Reminder',
      body: `
        <div class="fg">
          <label class="fl">What needs doing?</label>
          <input class="fi" id="r-title" placeholder="e.g. Schedule dentist appointment" />
        </div>
        <div class="fg">
          <label class="fl">Due Date (optional)</label>
          <input type="date" class="fi" id="r-due" />
        </div>
        <div class="fg">
          <label class="fl">Assign to</label>
          <select class="fi fi-select" id="r-who">
            <option value="both">Both</option>
            <option value="me">${esc(s.name1)}</option>
            <option value="partner">${esc(s.name2)}</option>
          </select>
        </div>
        <div class="fg">
          <label class="fl">Category (optional)</label>
          <select class="fi fi-select" id="r-cat">
            <option value="">None</option>
            <option>Admin</option><option>Health</option><option>School</option>
            <option>Home</option><option>Financial</option><option>Kids</option><option>Other</option>
          </select>
        </div>
        <button class="btn-save" onclick="Tasks.save()">Add Reminder</button>`
    });
  },
  async save() {
    const title = document.getElementById('r-title').value.trim();
    if (!title) return alert('Please enter a reminder.');
    await DB.add('reminders', {
      title,
      due_date: document.getElementById('r-due').value || null,
      assignee: document.getElementById('r-who').value,
      category: document.getElementById('r-cat').value,
      done: false
    });
    Modal.hide(); this.render(); Home.render();
  }
};

// ── Notification Inbox ────────────────────────────────────────────────
const NotifInbox = {
  async show() {
    Modal.show({ title: 'Notification History', body: '<div style="text-align:center;padding:20px;color:var(--txt2)">Loading…</div>' });
    const { data } = await sb.from('notifications')
      .select('*').order('created_at', { ascending: false }).limit(50);
    const items = data || [];
    localStorage.setItem('cgm_notif_seen', new Date().toISOString());
    const btn = document.getElementById('home-bell-btn');
    if (btn) btn.querySelector('.bell-dot')?.remove();
    if (!items.length) {
      Modal.show({ title: 'Notification History', body: `
        <div class="empty">
          <div class="empty-icon">🔔</div>
          <div class="empty-title">No notifications yet</div>
          <div class="empty-sub">Past notifications will appear here.</div>
        </div>` });
      return;
    }
    const fmt = iso => {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
             ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    };
    Modal.show({
      title: 'Notification History',
      body: items.map(n => `
        <div class="notif-item">
          <div class="notif-item-title">${esc(n.title)}</div>
          <div class="notif-item-body">${esc(n.body)}</div>
          <div class="notif-item-time">${fmt(n.created_at)}</div>
        </div>`).join('')
    });
  },

  async checkUnread() {
    try {
      const lastSeen = localStorage.getItem('cgm_notif_seen') || '1970-01-01T00:00:00Z';
      const { count } = await sb.from('notifications')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', lastSeen);
      if (count > 0) {
        const btn = document.getElementById('home-bell-btn');
        if (btn && !btn.querySelector('.bell-dot')) {
          const dot = document.createElement('span');
          dot.className = 'bell-dot';
          btn.appendChild(dot);
        }
      }
    } catch { /* ignore */ }
  }
};

// ── Push Notifications ─────────────────────────────────────────────
const Notifications = {
  _supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async status() {
    if (!this._supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return 'unsubscribed';
      const { data } = await sb.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
      return data ? 'subscribed' : 'unsubscribed';
    } catch {
      return 'unsubscribed';
    }
  },

  async subscribe() {
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Get existing subscription or create new one
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const json = sub.toJSON();
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    }, { onConflict: 'user_id,endpoint' });

    if (error) { console.error('Push subscribe error:', error); return false; }
    return true;
  },

  async unsubscribe() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  },

  _urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
  }
};

// ── More / Settings ────────────────────────────────────────────────
const More = {
  async showSettings() {
    const s = settings();
    const notifStatus = await Notifications.status();
    const notifLabel = { subscribed: 'Enabled', unsubscribed: 'Not enabled', denied: 'Blocked in settings', unsupported: 'Not supported' }[notifStatus];
    Modal.show({
      title: 'Settings',
      body: `
        <div class="set-item" onclick="More.editMembers()">
          <div class="set-icon">👤</div>
          <div class="set-label">Family Members</div>
          <div class="set-value">${esc(s.name1)} &amp; ${esc(s.name2)}</div>
          <div class="set-chevron">›</div>
        </div>
        <div class="set-item" onclick="More.manageFaceId()">
          <div class="set-icon">🔐</div>
          <div class="set-label">Face ID</div>
          <div class="set-value" id="fid-status">${Biometric.isRegistered() ? 'Enabled' : 'Not set up'}</div>
          <div class="set-chevron">›</div>
        </div>
        <div class="set-item" onclick="More.manageNotifications()">
          <div class="set-icon">🔔</div>
          <div class="set-label">Notifications</div>
          <div class="set-value" id="notif-status">${notifLabel}</div>
          <div class="set-chevron">›</div>
        </div>
        <div class="set-item" onclick="Auth.signOut()">
          <div class="set-icon">🔒</div>
          <div class="set-label">Sign Out</div>
          <div class="set-chevron">›</div>
        </div>
        <div class="set-item" onclick="More._forceRefresh()">
          <div class="set-icon">🔄</div>
          <div class="set-label">Check for Updates</div>
          <div class="set-chevron">›</div>
        </div>
        <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)">
          <div style="font-weight:800;color:var(--navy);font-size:16px">Casa GM</div>
          <div style="font-size:12px;color:var(--gold);margin-top:6px;font-weight:600">For Grant &amp; Miles 💛</div>
          <div style="font-size:11px;color:var(--txt2);margin-top:4px">v${APP_VERSION}</div>
        </div>`
    });
  },

  async manageNotifications() {
    const status = await Notifications.status();
    if (status === 'unsupported') {
      Modal.show({ title: 'Notifications', body: `<p style="color:var(--txt2);font-size:15px;line-height:1.6">Push notifications aren't supported on this device or browser.<br><br>Make sure the app is installed to your home screen and you're on iOS 16.4+.</p>` });
      return;
    }
    if (status === 'denied') {
      Modal.show({ title: 'Notifications', body: `<p style="color:var(--txt2);font-size:15px;line-height:1.6">Notifications are blocked. To enable them, go to <strong>Settings → Safari → [your site] → Notifications → Allow</strong>.</p>` });
      return;
    }
    Modal.show({
      title: 'Notifications',
      body: `
        <div style="text-align:center;padding:8px 0 16px">
          <div style="font-size:48px;margin-bottom:14px">🔔</div>
          <p style="color:var(--txt2);font-size:15px;line-height:1.6;margin-bottom:24px">
            ${status === 'subscribed'
              ? 'You\'ll get a daily notification for reminders due today or overdue.'
              : 'Get notified each morning when you have reminders due or overdue.'}
          </p>
          ${status === 'subscribed'
            ? `<button class="btn-save btn-danger" onclick="More._disableNotifications()">Turn Off Notifications</button>`
            : `<button class="btn-save" onclick="More._enableNotifications()">Enable Notifications</button>`}
        </div>`
    });
  },

  async _enableNotifications() {
    Modal.hide();
    const ok = await Notifications.subscribe();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:' + (ok ? '#10b981' : '#ef4444') + ';color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;font-weight:600;z-index:9999;white-space:nowrap';
    el.textContent = ok ? '✓ Notifications enabled' : '✗ Permission denied';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
    const statusEl = document.getElementById('notif-status');
    if (statusEl && ok) statusEl.textContent = 'Enabled';
  },

  async _disableNotifications() {
    await Notifications.unsubscribe();
    Modal.hide();
    const statusEl = document.getElementById('notif-status');
    if (statusEl) statusEl.textContent = 'Not enabled';
  },
  async manageFaceId() {
    const registered = Biometric.isRegistered();
    const available  = await Biometric.available();
    if (!available) {
      Modal.show({ title: 'Face ID', body: `<p style="color:var(--txt2);font-size:15px;line-height:1.6">Face ID isn't available on this device or browser.</p>` });
      return;
    }
    Modal.show({
      title: 'Face ID',
      body: `
        <div style="text-align:center;padding:4px 0 8px">
          <div style="font-size:48px;margin-bottom:14px">🔐</div>
          <p style="color:var(--txt2);font-size:15px;line-height:1.6;margin-bottom:24px">
            ${registered ? 'Face ID is enabled. You can disable it or re-register below.' : 'Enable Face ID to unlock Casa GM without entering a code each time.'}
          </p>
          ${registered
            ? `<button class="btn-save btn-danger" onclick="More._disableFaceId()">Disable Face ID</button>
               <button class="btn-save" style="margin-top:10px" onclick="Auth._registerFaceId()">Re-register Face ID</button>`
            : `<button class="btn-save" onclick="Auth._registerFaceId()">Enable Face ID</button>`}
        </div>`
    });
  },
  async _forceRefresh() {
    Modal.hide();
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch(e) { console.error(e); }
    window.location.reload();
  },
  _disableFaceId() {
    Biometric.clear();
    Modal.hide();
    this.render();
  },
  editMembers() {
    const s = settings();
    Modal.show({
      title: 'Family Members',
      body: `
        <div class="fg">
          <label class="fl">Your Name</label>
          <input class="fi" id="s-n1" value="${esc(s.name1)}" />
        </div>
        <div class="fg">
          <label class="fl">Partner's Name</label>
          <input class="fi" id="s-n2" value="${esc(s.name2)}" />
        </div>
        <button class="btn-save" onclick="More._saveMembers()">Save</button>`
    });
  },
  _saveMembers() {
    const s = settings();
    s.name1 = document.getElementById('s-n1').value.trim() || s.name1;
    s.name2 = document.getElementById('s-n2').value.trim() || s.name2;
    saveSettings(s); Modal.hide(); this.render();
  },
};

// ── App Controller ─────────────────────────────────────────────────
const App = {
  cur: 'home',

  // Called on DOMContentLoaded — safe before auth
  setup() {
    // Set exact viewport height via JS — bypasses all iOS CSS height quirks
    const setVh = () => {
      document.documentElement.style.setProperty('--vh', window.innerHeight + 'px');
    };
    setVh();
    window.addEventListener('resize', setVh);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
    }
    Modal.init();
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.go(btn.dataset.s));
    });
    // Re-render home when iOS restores app from background
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.cur === 'home') Home.render();
    });
    window.addEventListener('pageshow', e => {
      if (e.persisted && this.cur === 'home') Home.render();
    });
  },

  // Called after successful auth + DB load
  start() {
    this.cur = 'home';
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-home').classList.add('active');
    document.querySelector('.nav-item[data-s="home"]').classList.add('active');
    Home.render();
  },

  go(section) {
    if (this.cur === section) return;
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('section-' + section).classList.add('active');
    document.querySelector(`.nav-item[data-s="${section}"]`).classList.add('active');
    this.cur = section;
    this._render(section);
  },

  _render(s) {
    ({ home: () => Home.render(), docs: () => Docs.render(),
       calendar: () => Cal.render(), reminders: () => Tasks.render() }[s] || (() => {}))();
  }
};
