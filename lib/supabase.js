// Supabase client — browser-compatible (no process.env)
const SUPABASE_URL = 'https://qxmgyxjwpxkdbgldpdil.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_aqCSbMiVxH5cSZxgssdNqw_jQZvzmA0';

// Lightweight Supabase REST client for vanilla JS (no npm needed in browser)
export const supabase = {
    _url: SUPABASE_URL,
    _key: SUPABASE_ANON_KEY,

    _headers() {
        return {
            'apikey': this._key,
            'Authorization': `Bearer ${this._key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    },

    auth: {
        async signUp({ email, password, data: userData }) {
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password, data: userData })
                });
                const raw = await res.json().catch(() => null);
                if (!res.ok) return { data: null, error: raw || { message: `HTTP ${res.status}` } };
                
                // Existing account (obfuscated by Supabase returns empty object 200 OK)
                if (raw && Object.keys(raw).length === 0) {
                    return { data: null, error: { message: 'Account already exists. Please sign in.' } };
                }

                // Normalize to match official SDK structure
                if (raw?.access_token) {
                    return { data: { session: raw, user: raw.user }, error: null };
                }
                return { data: { session: null, user: raw?.id ? raw : raw.user }, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        },

        async verifyOtp({ email, token, type = 'signup' }) {
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, token, type })
                });
                const raw = await res.json().catch(() => null);
                if (!res.ok) return { data: null, error: raw || { message: `HTTP ${res.status}` } };
                
                // Normalize 
                if (raw?.access_token) {
                    return { data: { session: raw, user: raw.user }, error: null };
                }
                return { data: { session: null, user: raw?.id ? raw : raw.user }, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        },

        async signInWithPassword({ email, password }) {
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
                    method: 'POST',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });
                const raw = await res.json().catch(() => null);
                if (!res.ok) return { data: null, error: raw || { message: `HTTP ${res.status}` } };
                
                // Normalize 
                if (raw?.access_token) {
                    return { data: { session: raw, user: raw.user }, error: null };
                }
                return { data: { session: null, user: raw?.id ? raw : raw.user }, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        },

        async getUser(token) {
            try {
                const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                    method: 'GET',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await res.json().catch(() => null);
                if (!res.ok) return { data: null, error: data || { message: `HTTP ${res.status}` } };
                return { data: { user: data }, error: null };
            } catch (err) {
                return { data: null, error: err };
            }
        }
    },

    from(table) {
        return new SupabaseQuery(this._url, this._key, table);
    }
};

class SupabaseQuery {
    constructor(url, key, table) {
        this._url = url;
        this._key = key;
        this._table = table;
        this._params = [];
        this._method = 'GET';
        this._body = null;
        this._headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    }

    select(columns = '*') {
        this._params.push(`select=${encodeURIComponent(columns)}`);
        return this;
    }

    eq(column, value) {
        this._params.push(`${column}=eq.${encodeURIComponent(value)}`);
        return this;
    }

    neq(column, value) {
        this._params.push(`${column}=neq.${encodeURIComponent(value)}`);
        return this;
    }

    gte(column, value) {
        this._params.push(`${column}=gte.${encodeURIComponent(value)}`);
        return this;
    }

    lte(column, value) {
        this._params.push(`${column}=lte.${encodeURIComponent(value)}`);
        return this;
    }

    not(column, operator, value) {
        this._params.push(`${column}=not.${operator}.${encodeURIComponent(value)}`);
        return this;
    }

    ilike(column, pattern) {
        this._params.push(`${column}=ilike.${encodeURIComponent(pattern)}`);
        return this;
    }

    in(column, values) {
        const list = Array.isArray(values) ? values.join(',') : values;
        this._params.push(`${column}=in.(${encodeURIComponent(list)})`);
        return this;
    }

    order(column, { ascending = true } = {}) {
        this._params.push(`order=${column}.${ascending ? 'asc' : 'desc'}`);
        return this;
    }

    limit(n) {
        this._params.push(`limit=${n}`);
        return this;
    }

    or(conditions) {
        this._params.push(`or=(${conditions})`);
        return this;
    }

    insert(data) {
        this._method = 'POST';
        this._body = JSON.stringify(Array.isArray(data) ? data : [data]);
        // Return `this` so callers can chain .select() before awaiting
        return this;
    }

    update(data) {
        this._method = 'PATCH';
        this._body = JSON.stringify(data);
        // Return `this` so callers can chain .eq() etc. before awaiting
        return this;
    }

    delete() {
        this._method = 'DELETE';
        return this;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }

    async _execute() {
        const query = this._params.length ? `?${this._params.join('&')}` : '';
        const url = `${this._url}/rest/v1/${this._table}${query}`;

        try {
            const res = await fetch(url, {
                method: this._method,
                headers: this._headers,
                body: this._body || undefined
            });

            const text = await res.text();
            let data = null;
            try { data = text ? JSON.parse(text) : null; } catch { data = text; }

            if (!res.ok) {
                return { data: null, error: data || { message: `HTTP ${res.status}` } };
            }
            return { data, error: null };
        } catch (err) {
            return { data: null, error: { message: err.message } };
        }
    }
}