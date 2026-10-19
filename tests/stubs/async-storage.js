const m = new Map();
module.exports = { default: { getItem: async k => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async k => void m.delete(k) } };
