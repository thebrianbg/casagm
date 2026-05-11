/* ================================================================
   Casa GM — auth.js
   Supabase client, DB cache + real-time sync, Auth lock screen
   ================================================================ */

// ── Supabase client (global `sb` used by app.js too) ──────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DB — Supabase-backed cache with real-time sync ─────────────────
const DB = {
  _c: { events: [], reminders: [], docs: [] },

  list(t) { return this._c[t] || []; },

  async load() {
    const [e, r, d] = await Promise.all([
      sb.from('events').select('*').order('created_at', { ascending: false }),
      sb.from('reminders').select('*').order('created_at', { ascending: false }),
      sb.from('docs').select('*').order('created_at', { ascending: false }),
    ]);
    this._c.events    = e.data || [];
    this._c.reminders = r.data || [];
    this._c.docs      = d.data || [];
  },

  async add(t, item) {
    const { data, error } = await sb.from(t).insert(item).select().single();
    if (error) { console.error(error); throw error; }
    this._c[t].unshift(data);
    return data;
  },

  async update(t, id, patch) {
    const { data, error } = await sb.from(t).update(patch).eq('id', id).select().single();
    if (error) { console.error(error); throw error; }
    const i = this._c[t].findIndex(x => x.id === id);
    if (i > -1) this._c[t][i] = data;
    return data;
  },

  async remove(t, id) {
    const { error } = await sb.from(t).delete().eq('id', id);
    if (error) { console.error(error); throw error; }
    this._c[t] = this._c[t].filter(x => x.id !== id);
  },

  subscribe() {
    sb.channel('family-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' },
          () => this._reload('events'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reminders' },
          () => this._reload('reminders'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' },
          () => this._reload('docs'))
      .subscribe();
  },

  async _reload(t) {
    const { data } = await sb.from(t).select('*').order('created_at', { ascending: false });
    this._c[t] = data || [];
    App._render(App.cur);
    if (App.cur !== 'home') Home.render();
  }
};

// ── Auth ───────────────────────────────────────────────────────────
const Auth = {
  init() {
    sb.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const email = session.user.email.toLowerCase();
        if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          await sb.auth.signOut();
          this._showError('This email isn\'t authorized to access Casa GM.');
          return;
        }
        this._hide();
        await DB.load();
        DB.subscribe();
        App.start();
      } else {
        this._show();
      }
    });
  },

  _show() {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    // Reset form state
    document.getElementById('auth-form').classList.remove('hidden');
    document.getElementById('auth-sent').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-email').value = '';
  },

  _hide() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  async sendLink() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const btn   = document.getElementById('auth-btn');
    if (!email) return;

    if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      this._showError('That email isn\'t authorized.');
      return;
    }

    btn.textContent = 'Sending…';
    btn.disabled    = true;

    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin }
    });

    if (error) {
      this._showError(error.message);
      btn.textContent = 'Send Magic Link';
      btn.disabled    = false;
    } else {
      document.getElementById('auth-form').classList.add('hidden');
      document.getElementById('auth-sent').classList.remove('hidden');
    }
  },

  async signOut() {
    await sb.auth.signOut();
  },

  _showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }
};

// ── Boot ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  App.setup();
  Auth.init();
});
