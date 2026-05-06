// ─── Security Helpers ─────────────────────────────────────────────────────────

/**
 * Safely escapes a string to prevent XSS when inserted into the DOM.
 * Used as a fallback; prefer textContent / createTextNode over innerHTML.
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
}

/**
 * Validates and sanitizes all transaction fields before they reach the DB.
 * Returns { ok: false, error: string } on failure, or { ok: true, record } on success.
 */
function validateTransaction(description, amount, type) {
    // ── Type whitelist ── Only these two values are allowed; anything else is rejected.
    const ALLOWED_TYPES = ['income', 'expense'];
    if (!ALLOWED_TYPES.includes(type)) {
        return { ok: false, error: 'Invalid transaction type.' };
    }

    // ── Description ──
    const cleanDesc = description.trim();
    if (!cleanDesc) {
        return { ok: false, error: 'Description is required.' };
    }
    if (cleanDesc.length > 150) {
        return { ok: false, error: 'Description must be 150 characters or fewer.' };
    }

    // ── Amount ──
    const cleanAmount = parseFloat(amount);
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
        return { ok: false, error: 'Amount must be a positive number.' };
    }
    // Guard against absurdly large values (max ₱999,999,999.99)
    if (cleanAmount > 999_999_999.99) {
        return { ok: false, error: 'Amount exceeds the maximum allowed value.' };
    }
    // Enforce 2 decimal places precision
    const preciseAmount = parseFloat(cleanAmount.toFixed(2));

    return { ok: true, record: { description: cleanDesc, amount: preciseAmount, type } };
}

// ─── Supabase DB Layer ────────────────────────────────────────────────────────
class SupabaseClient {
    async init() {
        const { data: { session }, error } = await sb.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            throw new Error('Not authenticated');
        }
        this.userId = session.user.id;
    }

    async add(record) {
        const { data, error } = await sb
            .from('transactions')
            .insert([{
                user_id: this.userId,
                description: record.description,
                amount: record.amount,
                type: record.type,
                date: record.date
            }])
            .select()
            .single();
        if (error) throw new Error(error.message);
        return data;
    }

    async remove(id) {
        // Ensure id is a number/UUID string — reject anything that looks tampered.
        if (!id || typeof id !== 'string' && typeof id !== 'number') {
            throw new Error('Invalid transaction ID.');
        }
        const { error } = await sb
            .from('transactions')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
    }

    async getAll(query = '') {
        let q = sb
            .from('transactions')
            .select('*')
            .order('id', { ascending: false });

        // Supabase SDK uses parameterized queries — the search term is NEVER
        // interpolated raw into SQL. ilike() passes it as a bind parameter.
        if (query.trim() !== '') {
            // Limit search query length to prevent abuse
            const safeQuery = query.trim().slice(0, 100);
            q = q.ilike('description', `%${safeQuery}%`);
        }

        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data;
    }
}

// ─── Main App ─────────────────────────────────────────────────────────────────
class FinanceTracker {
    constructor() {
        this.db = new SupabaseClient();
        this.transactions = [];

        this.form        = document.getElementById('transactionForm');
        this.descInput   = document.getElementById('desc');
        this.amountInput = document.getElementById('amount');
        this.searchInput = document.getElementById('searchInput');
        this.listEl      = document.getElementById('transactionList');
        this.balEl       = document.getElementById('totalBalance');
        this.incEl       = document.getElementById('totalIncome');
        this.expEl       = document.getElementById('totalExpenses');
        this.formError   = document.getElementById('formError');

        this.searchTimeout = null;
        this.init();
    }

    async init() {
        try {
            this.listEl.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-muted-foreground">Connecting to Supabase...</td></tr>';
            await this.db.init();
            await this.refreshData();
        } catch (err) {
            console.error('Failed to initialize', err);
            if (err.message !== 'Not authenticated') {
                this.listEl.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-rose-500 font-medium">Failed to connect to database.</td></tr>';
            }
            return;
        }

        this.form.addEventListener('submit', (e) => this.addTransaction(e));
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.refreshData(e.target.value);
            }, 300);
        });
    }

    async refreshData(query = '') {
        try {
            this.transactions = await this.db.getAll(query);
            this.updateTotals();
            this.renderList();
        } catch (err) {
            console.error(err);
            this.listEl.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-rose-500 font-medium">Failed to load transactions.</td></tr>';
        }
    }

    showFormError(msg) {
        if (this.formError) {
            this.formError.textContent = msg;
            this.formError.style.display = 'block';
        }
    }

    clearFormError() {
        if (this.formError) {
            this.formError.textContent = '';
            this.formError.style.display = 'none';
        }
    }

    async addTransaction(e) {
        e.preventDefault();
        this.clearFormError();

        const rawDesc   = this.descInput.value;
        const rawAmount = this.amountInput.value;
        const rawType   = document.querySelector('input[name="type"]:checked')?.value ?? '';

        // ── Validate all fields before touching the database ──
        const result = validateTransaction(rawDesc, rawAmount, rawType);
        if (!result.ok) {
            this.showFormError(result.error);
            return;
        }

        const record = {
            ...result.record,
            date: new Date().toISOString()
        };

        try {
            await this.db.add(record);
            await this.refreshData(this.searchInput.value);
        } catch (err) {
            console.error('Failed to save transaction', err);
            this.showFormError('Could not save transaction. Please try again.');
            return;
        }

        this.form.reset();
        document.querySelector('input[name="type"][value="income"]').checked = true;
    }

    async deleteTransaction(id) {
        try {
            await this.db.remove(id);
            await this.refreshData(this.searchInput.value);
        } catch (err) {
            console.error('Failed to delete transaction', err);
        }
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
    }

    formatDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    updateTotals() {
        const totals = this.transactions.reduce((acc, t) => {
            if (t.type === 'income') { acc.income += t.amount; acc.balance += t.amount; }
            else                     { acc.expense += t.amount; acc.balance -= t.amount; }
            return acc;
        }, { income: 0, expense: 0, balance: 0 });

        this.balEl.textContent = this.formatCurrency(totals.balance);
        this.incEl.textContent = this.formatCurrency(totals.income);
        this.expEl.textContent = this.formatCurrency(totals.expense);
    }

    renderList() {
        // Clear the list safely
        this.listEl.replaceChildren();

        if (this.transactions.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5;
            td.className = 'text-center py-8 text-muted-foreground';
            td.textContent = 'No transactions found.';
            tr.appendChild(td);
            this.listEl.appendChild(tr);
            return;
        }

        this.transactions.forEach(t => {
            const isIncome = t.type === 'income';
            const tr = document.createElement('tr');
            tr.className = 'animate-fade-in group';

            // ── Column 1: Description ──────────────────────────────────────────
            // Uses textContent — NEVER innerHTML — so no XSS is possible.
            const tdDesc = document.createElement('td');
            tdDesc.className = 'px-4 py-3 font-medium';
            tdDesc.textContent = t.description; // ✅ Safe: textContent, not innerHTML

            // ── Column 2: Date ────────────────────────────────────────────────
            const tdDate = document.createElement('td');
            tdDate.className = 'px-4 py-3 text-xs text-muted-foreground';
            tdDate.textContent = this.formatDate(t.date); // ✅ Safe

            // ── Column 3: Type Badge ──────────────────────────────────────────
            const tdType = document.createElement('td');
            tdType.className = 'px-4 py-3';
            const badge = document.createElement('span');
            badge.className = `inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                isIncome
                    ? 'text-emerald-700 bg-emerald-50 ring-emerald-600/20'
                    : 'text-rose-700 bg-rose-50 ring-rose-600/20'
            }`;
            // ✅ Safe: only hardcoded strings from our own whitelist check
            badge.textContent = isIncome ? 'Income' : 'Expense';
            tdType.appendChild(badge);

            // ── Column 4: Amount ──────────────────────────────────────────────
            const tdAmount = document.createElement('td');
            tdAmount.className = `px-4 py-3 text-right ${isIncome ? 'text-emerald-600' : 'text-rose-600'} font-medium`;
            // formatCurrency returns a locale-formatted number string — safe
            tdAmount.textContent = `${isIncome ? '+' : '-'}${this.formatCurrency(t.amount)}`; // ✅ Safe

            // ── Column 5: Delete Button ───────────────────────────────────────
            const tdAction = document.createElement('td');
            tdAction.className = 'px-4 py-3 text-right';

            const btn = document.createElement('button');
            btn.className = 'btn btn-ghost btn-icon-sm btn-destructive opacity-0 group-hover:opacity-100 transition-opacity';
            btn.setAttribute('aria-label', 'Delete transaction');
            // ✅ Safe: data-id is set via setAttribute, not innerHTML
            btn.dataset.id = t.id;

            // SVG trash icon — hardcoded, not from user data
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                aria-hidden="true">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                <line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
            </svg>`;

            btn.addEventListener('click', () => this.deleteTransaction(t.id));
            tdAction.appendChild(btn);

            tr.append(tdDesc, tdDate, tdType, tdAmount, tdAction);
            this.listEl.appendChild(tr);
        });
    }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    new FinanceTracker();
    initTheme();
});

function initTheme() {
    const html     = document.documentElement;
    const btn      = document.getElementById('themeToggle');
    const iconSun  = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    const label    = document.getElementById('themeLabel');

    const saved       = localStorage.getItem('finance_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved ? saved === 'dark' : prefersDark);

    btn.addEventListener('click', () => {
        const dark = !html.classList.contains('dark');
        applyTheme(dark);
        localStorage.setItem('finance_theme', dark ? 'dark' : 'light');
    });

    function applyTheme(dark) {
        html.classList.toggle('dark', dark);
        iconSun.style.display  = dark ? 'block' : 'none';
        iconMoon.style.display = dark ? 'none'  : 'block';
        label.textContent      = dark ? 'Light Mode' : 'Dark Mode';
    }
}
