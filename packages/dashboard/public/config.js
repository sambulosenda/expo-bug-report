window.__BUGPULSE_API = 'https://bugpulse-proxy.sambulo.workers.dev';

window.__bp = {
  token: function() { return localStorage.getItem('bp_session'); },
  headers: function() {
    var t = this.token();
    return t ? { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  },
  fetch: function(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, this.headers(), opts.headers || {});
    return fetch(window.__BUGPULSE_API + path, opts);
  },
  login: function(token) { localStorage.setItem('bp_session', token); },
  logout: function() { localStorage.removeItem('bp_session'); },
  isLoggedIn: function() { return !!this.token(); }
};
