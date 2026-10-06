// In-memory PostgREST query model: verifies actual predicates, ordering and ranges.
exports.database = function database(tables, failTable, headResult) {
  const calls = [];
  return { calls, from(table) {
    let rows = [...(tables[table] ?? [])], columns, options, orders = [], start = 0, end = Infinity;
    const call = { table, filters: [], orders, range: null }; calls.push(call);
    const query = {
      select(value, opts) { columns = value; options = opts; call.select = value; call.head = opts?.head === true; call.count = opts?.count; return this; },
      eq(key, value) { call.filters.push(['eq', key, value]); rows = rows.filter(r => r[key] === value); return this; },
      neq(key, value) { call.filters.push(['neq', key, value]); rows = rows.filter(r => r[key] != null && r[key] !== value); return this; },
      in(key, values) { call.filters.push(['in', key, values]); rows = rows.filter(r => values.includes(r[key])); return this; },
      or(value) { call.filters.push(['or', value]); rows = rows.filter(r => value.split(',').some(term => {
        const [key, op, v] = term.split('.'); return op === 'is' ? r[key] == null : r[key] === (v === 'true');
      })); return this; },
      order(key, { ascending }) { orders.push([key, ascending]); return this; },
      range(a, b) { start = a; end = b + 1; call.range = [a,b]; return this; },
      limit(n) { end = n; return this; },
      then(resolve, reject) {
        const error = table === failTable ? { code: 'DB_TEST' } : null;
        if (options?.head) return Promise.resolve({ data: null, count: rows.length, error, ...headResult }).then(resolve,reject);
        rows.sort((a,b) => { for (const [key, asc] of orders) {
          const c = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (c) return asc ? c : -c;
        } return 0; });
        return Promise.resolve({ data: rows.slice(start,end).map(r => Object.fromEntries(columns.split(',').map(k => [k.trim(),r[k.trim()]]))),
          error }).then(resolve,reject);
      },
    }; return query;
  } };
};
exports.thread = (id, roleplay_mode = false) => ({ id, title: id, roleplay_mode, user_id: 'u', project_id: 'p', updated_at: '1999-01-01' });
exports.message = (thread_id, n, extra = {}) => ({ id: `${thread_id}-${String(n).padStart(6,'0')}`, thread_id, user_id: 'u', role: 'user',
  provider: 'openai', is_active: true, content: '', created_at: new Date(Date.UTC(2026,0,1,0,0,n)).toISOString(), message_number: n, ...extra });
exports.preview = () => ({result:'preview',run_id:'run',model:'model',prompt_version:1,
  stats:{threads_total:2,threads_eligible:1,threads_included:1,threads_truncated:0,messages_truncated:0,input_chars:1000,input_chars_limit:60000,user_messages_included:2,user_messages_available:2},
  considered_threads:[{thread_id:'t',last_message_at:'2026-01-01T00:00:00Z',included_message_count:2,truncated:false,oldest_included_message_id:'a',newest_included_message_id:'b'}],
  topics:[{topic_key:'overview',content_md:'content'},{topic_key:'principles',content_md:'rules'},{topic_key:'references',content_md:'links'}]});
