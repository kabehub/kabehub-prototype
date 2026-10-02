// In-memory PostgREST query model: verifies actual predicates, ordering and ranges.
exports.database = function database(tables, failTable) {
  const calls = [];
  return { calls, from(table) {
    let rows = [...(tables[table] ?? [])], columns, orders = [], start = 0, end = Infinity;
    const call = { table, filters: [], orders, range: null }; calls.push(call);
    const query = {
      select(value) { columns = value; call.select = value; return this; },
      eq(key, value) { call.filters.push(['eq', key, value]); rows = rows.filter(r => r[key] === value); return this; },
      neq(key, value) { rows = rows.filter(r => r[key] != null && r[key] !== value); return this; },
      in(key, values) { rows = rows.filter(r => values.includes(r[key])); return this; },
      or(value) { call.filters.push(['or', value]); rows = rows.filter(r => value.split(',').some(term => {
        const [key, op, v] = term.split('.'); return op === 'is' ? r[key] == null : r[key] === (v === 'true');
      })); return this; },
      order(key, { ascending }) { orders.push([key, ascending]); return this; },
      range(a, b) { start = a; end = b + 1; call.range = [a,b]; return this; },
      limit(n) { end = n; return this; },
      then(resolve, reject) {
        rows.sort((a,b) => { for (const [key, asc] of orders) {
          const c = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (c) return asc ? c : -c;
        } return 0; });
        return Promise.resolve({ data: rows.slice(start,end).map(r => Object.fromEntries(columns.split(',').map(k => [k.trim(),r[k.trim()]]))),
          error: table === failTable ? { code: 'DB_TEST' } : null }).then(resolve,reject);
      },
    }; return query;
  } };
};
exports.thread = (id, roleplay_mode = false) => ({ id, title: id, roleplay_mode, user_id: 'u', project_id: 'p', updated_at: '1999-01-01' });
exports.message = (thread_id, n, extra = {}) => ({ id: `${thread_id}-${String(n).padStart(6,'0')}`, thread_id, user_id: 'u', role: 'user',
  provider: 'openai', is_active: true, content: '', created_at: new Date(Date.UTC(2026,0,1,0,0,n)).toISOString(), message_number: n, ...extra });
