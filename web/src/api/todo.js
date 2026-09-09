async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.error || value.message || '请求失败'), { status: response.status });
  return value;
}

function body(method, value) {
  return { method, body: JSON.stringify(value || {}) };
}

export const todoApi = {
  config() { return request('/config'); },
  list() { return request('/items'); },
  create(payload) { return request('/items', body('POST', payload)); },
  update(id, payload) { return request(`/items/${encodeURIComponent(id)}`, body('PATCH', payload)); },
  setDone(id, done) { return request(`/items/${encodeURIComponent(id)}/done`, body('POST', { done })); },
  archive(id) { return request(`/items/${encodeURIComponent(id)}/archive`, body('POST')); },
  month(id, month) { return request(`/items/${encodeURIComponent(id)}/month?month=${encodeURIComponent(month)}`); },
  calendar(month) { return request(`/calendar?month=${encodeURIComponent(month)}`); },
  day(date) { return request(`/day?date=${encodeURIComponent(date)}`); },
  points(limit = 30) { return request(`/points?limit=${encodeURIComponent(limit)}`); },
  rewards(includeArchived = false) { return request(`/rewards${includeArchived ? '?archived=1' : ''}`); },
  createReward(payload) { return request('/rewards', body('POST', payload)); },
  updateReward(id, payload) { return request(`/rewards/${encodeURIComponent(id)}`, body('PATCH', payload)); },
  redeemReward(id) { return request(`/rewards/${encodeURIComponent(id)}/redeem`, body('POST')); },
  archiveReward(id) { return request(`/rewards/${encodeURIComponent(id)}/archive`, body('POST')); },
  restoreReward(id) { return request(`/rewards/${encodeURIComponent(id)}/restore`, body('POST')); },
};
