/* ================================================================
   Casa GM — auth.js
   Supabase client, DB cache + real-time sync, Auth + Face ID
   ================================================================ */

// ── Supabase client ────────────────────────────────────────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'casagm-auth'
  }
});

// ── DB — Supabase-backed cache with real-time sync ─────────────────
const DB = {
  _c: { events: [], reminders: [], docs: [] },

  list(t) { return this._c[t] || []; },

  async load() {
    const token = await this._token();
    if (!token) return;
    const h = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
    const base = `${SUPABASE_URL}/rest/v1`;
    const [e, r, d] = await Promise.all([
      fetch(`${base}/events?select=*&order=created_at.desc`, { headers: h }).then(x => x.json()).catch(() => []),
      fetch(`${base}/reminders?select=*&order=created_at.desc`, { headers: h }).then(x => x.json()).catch(() => []),
      fetch(`${base}/docs?select=*&order=created_at.desc`, { headers: h }).then(x => x.json()).catch(() => []),
    ]);
    this._c.events    = Array.isArray(e) ? e : [];
    this._c.reminders = Array.isArray(r) ? r : [];
    this._c.docs      = Array.isArray(d) ? d : [];
  },

  async _token() {
    try {
      const raw = localStorage.getItem('casagm-auth');
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s?.expires_at && Date.now() / 1000 < s.expires_at - 30) return s.access_token;
      // Token expired — refresh directly without JS client
      if (s?.refresh_token) {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: s.refresh_token })
        });
        if (res.ok) {
          const ns = await res.json();
          localStorage.setItem('casagm-auth', JSON.stringify(ns));
          return ns.access_token;
        }
      }
    } catch {}
    return null;
  },

  async _req(method, t, body, id) {
    const token = await this._token();
    if (!token) throw new Error('Session expired — please sign out and sign in again.');
    const url = `${SUPABASE_URL}/rest/v1/${t}${id ? `?id=eq.${id}` : ''}`;
    const res = await fetch(url, {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Error ${res.status}`);
    }
    return method === 'DELETE' ? null : res.json();
  },

  async add(t, item) {
    const rows = await this._req('POST', t, item);
    const data = Array.isArray(rows) ? rows[0] : rows;
    this._c[t].unshift(data);
    return data;
  },

  async update(t, id, patch) {
    const rows = await this._req('PATCH', t, patch, id);
    const data = Array.isArray(rows) ? rows[0] : rows;
    const i = this._c[t].findIndex(x => x.id === id);
    if (i > -1) this._c[t][i] = data;
    return data;
  },

  async remove(t, id) {
    await this._req('DELETE', t, null, id);
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
    try {
      const token = await this._token();
      if (!token) return;
      const h = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` };
      const data = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*&order=created_at.desc`, { headers: h }).then(x => x.json()).catch(() => null);
      if (!Array.isArray(data)) return;
      this._c[t] = data;
      App._render(App.cur);
      if (App.cur !== 'home') Home.render();
    } catch { /* ignore reload failures — next change will retry */ }
  }
};

// ── Biometric (WebAuthn / Face ID) ─────────────────────────────────
const Biometric = {
  KEY: 'cgm_fid',

  async available() {
    try {
      return !!(window.PublicKeyCredential &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch { return false; }
  },

  isRegistered() { return !!localStorage.getItem(this.KEY); },

  async register(userId) {
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Casa GM', id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(userId),
            name: userId,
            displayName: 'Casa GM'
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000
        }
      });
      const id = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      localStorage.setItem(this.KEY, id);
      return true;
    } catch (e) {
      console.log('Face ID registration cancelled', e);
      return false;
    }
  },

  async verify() {
    const b64 = localStorage.getItem(this.KEY);
    if (!b64) return false;
    try {
      const credId = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const result = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: credId }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      return !!result;
    } catch { return false; }
  },

  clear() { localStorage.removeItem(this.KEY); }
};

// ── Auth ───────────────────────────────────────────────────────────
const Auth = {
  _firstSignIn: false,
  _userId: null,

  init() {
    sb.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const email = session.user.email.toLowerCase();
        if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
          await sb.auth.signOut();
          this._showError('This email isn\'t authorized to access Casa GM.');
          return;
        }
        this._userId = session.user.id;
        this._firstSignIn = (event === 'SIGNED_IN');
        this._hide();
        App.start();          // show home immediately — no blank wait
        await DB.load();      // load data in background
        DB.subscribe();
        Home.render();        // re-render home with real data
        NotifInbox.checkUnread();
        if (this._firstSignIn && await Biometric.available() && !Biometric.isRegistered()) {
          setTimeout(() => this._offerFaceId(), 1200);
        }
      } else {
        this._show();
      }
    });
  },

  async _show() {
    document.getElementById('lock-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    this.resetForm();

    // Show Face ID button if registered
    const fidSection = document.getElementById('lock-fid');
    if (Biometric.isRegistered() && await Biometric.available()) {
      fidSection.classList.remove('hidden');
      setTimeout(() => this.unlockWithFaceId(), 400);
    } else {
      fidSection.classList.add('hidden');
    }
  },

  _hide() {
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  async unlockWithFaceId() {
    const btn = document.getElementById('fid-btn');
    if (btn) { btn.textContent = 'Verifying…'; btn.disabled = true; }

    const ok = await Biometric.verify();
    if (!ok) {
      if (btn) { btn.textContent = '🔐  Use Face ID'; btn.disabled = false; }
      return;
    }

    // Face ID passed — restore session from localStorage (avoids hanging refreshSession)
    try {
      const raw = localStorage.getItem('casagm-auth');
      const s = raw ? JSON.parse(raw) : null;
      if (s?.access_token && s?.refresh_token) {
        const token = await this._token(); // refreshes if expired
        if (token) {
          const { data } = await sb.auth.setSession({ access_token: token, refresh_token: s.refresh_token });
          if (data?.session) return; // onAuthStateChange fires and opens app
        }
      }
    } catch {}
    // Session unrecoverable
    Biometric.clear();
    this._showError('Your session expired. Please sign in with email once more.');
    if (btn) { btn.textContent = '🔐  Use Face ID'; btn.disabled = false; }
    document.getElementById('lock-fid').classList.add('hidden');
  },

  async sendCode() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const btn   = document.getElementById('auth-btn');
    if (!email) return;

    if (!ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
      this._showError('That email isn\'t authorized.');
      return;
    }

    btn.textContent = 'Sending…';
    btn.disabled    = true;

    const { error } = await Promise.race([
      sb.auth.signInWithOtp({ email }),
      new Promise((_, r) => setTimeout(() => r(new Error('Request timed out — check your connection.')), 10000))
    ]).catch(e => ({ error: e }));

    if (error) {
      this._showError(error.message);
      btn.textContent = 'Send Code';
      btn.disabled    = false;
    } else {
      this._pendingEmail = email;
      document.getElementById('auth-step-email').classList.add('hidden');
      document.getElementById('auth-step-code').classList.remove('hidden');
      document.getElementById('auth-email-display').textContent = email;
      document.getElementById('auth-error').classList.add('hidden');
      setTimeout(() => document.getElementById('auth-code').focus(), 100);
    }
  },

  async verifyCode() {
    const code  = document.getElementById('auth-code').value.trim();
    if (!code) return;

    const { error } = await Promise.race([
      sb.auth.verifyOtp({ email: this._pendingEmail, token: code, type: 'email' }),
      new Promise((_, r) => setTimeout(() => r(new Error('Request timed out — check your connection.')), 10000))
    ]).catch(e => ({ error: e }));

    if (error) {
      this._showError('Invalid code — check your email and try again.');
    }
    // On success, onAuthStateChange fires automatically
  },

  resetForm() {
    document.getElementById('auth-step-email').classList.remove('hidden');
    document.getElementById('auth-step-code').classList.add('hidden');
    document.getElementById('auth-error').classList.add('hidden');
    document.getElementById('auth-email').value = '';
    const codeEl = document.getElementById('auth-code');
    if (codeEl) codeEl.value = '';
    const btn = document.getElementById('auth-btn');
    if (btn) { btn.textContent = 'Send Code'; btn.disabled = false; }
  },

  _offerFaceId() {
    Modal.show({
      title: 'Enable Face ID?',
      body: `
        <div style="text-align:center;padding:4px 0 8px">
          <div style="font-size:52px;margin-bottom:14px">🔐</div>
          <p style="color:var(--txt2);font-size:15px;line-height:1.6;margin-bottom:24px">
            Unlock Casa GM with Face ID next time — no magic link needed.
          </p>
          <button class="btn-save" onclick="Auth._registerFaceId()">Enable Face ID</button>
          <button onclick="Modal.hide()" style="background:none;border:none;color:var(--txt3);font-size:14px;margin-top:14px;display:block;width:100%;cursor:pointer">Not now</button>
        </div>`
    });
  },

  async _registerFaceId() {
    Modal.hide();
    const ok = await Biometric.register(this._userId);
    if (ok) {
      const statusEl = document.getElementById('fid-status');
      if (statusEl) statusEl.textContent = 'Enabled';
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:10px 20px;border-radius:20px;font-size:14px;font-weight:600;z-index:9999';
      el.textContent = '✓ Face ID enabled';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2500);
    }
  },

  async signOut() {
    Biometric.clear();
    try { await sb.auth.signOut(); } catch(e) { console.error(e); }
    this._show();
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
