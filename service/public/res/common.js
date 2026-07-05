const Auth = {
  accessToken: null,

  async silentRefresh() {
    try {
      const r = await fetch('/service/auth/refresh', { method: 'POST', credentials: 'include' });
      if (!r.ok) return null;
      return (await r.json()).accessToken ?? null;
    } catch { return null; }
  },

  async logout() {
    try { await fetch('/service/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    window.location.href = '/service/login';
  },

  parseJwtPayload(token) {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  },

  async apiFetch(method, url, body) {
    const opts = {
      method,
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    let res = await fetch(url, opts);
    if (res.status === 401) {
      this.accessToken = await this.silentRefresh();
      if (!this.accessToken) { window.location.href = '/service/login'; return null; }
      opts.headers['Authorization'] = `Bearer ${this.accessToken}`;
      res = await fetch(url, opts);
    }
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  },
};
