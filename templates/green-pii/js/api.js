'use strict';

(function () {
  const base = '';

  async function request(path, options) {
    const res = await fetch(base + path, options);
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (body && body.error) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  window.WeddingAPI = {
    getWedding()  { return request('/api/wedding'); },
    getComments() { return request('/api/comments'); },
    postComment(payload) {
      return request('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };
})();
