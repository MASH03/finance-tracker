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

        if (query.trim() !== '') {
            q = q.ilike('description', `%${query}%`);
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

    async addTransaction(e) {
        e.preventDefault();

        const description = this.descInput.value.trim();
        const amount      = parseFloat(this.amountInput.value);
        const type        = document.querySelector('input[name="type"]:checked').value;

        if (!description || isNaN(amount) || amount <= 0) return;

        const record = { 
            description, 
            amount, 
            type, 
            date: new Date().toISOString() 
        };

        try {
            await this.db.add(record);
            await this.refreshData(this.searchInput.value);
        } catch (err) {
            console.error('Failed to save transaction', err);
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
        this.listEl.innerHTML = '';

        if (this.transactions.length === 0) {
            this.listEl.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-muted-foreground">No transactions found.</td></tr>';
            return;
        }

        this.transactions.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = 'animate-fade-in group';
            const isIncome = t.type === 'income';

            tr.innerHTML = `
                <td class="px-4 py-3 font-medium">${t.description}</td>
                <td class="px-4 py-3 text-xs text-muted-foreground">${this.formatDate(t.date)}</td>
                <td class="px-4 py-3">
                    <span class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${isIncome ? 'text-emerald-700 bg-emerald-50 ring-emerald-600/20' : 'text-rose-700 bg-rose-50 ring-rose-600/20'}">
                        ${isIncome ? 'Income' : 'Expense'}
                    </span>
                </td>
                <td class="px-4 py-3 text-right ${isIncome ? 'text-emerald-600' : 'text-rose-600'} font-medium">
                    ${isIncome ? '+' : '-'}${this.formatCurrency(t.amount)}
                </td>
                <td class="px-4 py-3 text-right">
                    <button class="btn btn-ghost btn-icon-sm btn-destructive opacity-0 group-hover:opacity-100 transition-opacity" data-id="${t.id}" aria-label="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </td>
            `;

            tr.querySelector('button').addEventListener('click', () => this.deleteTransaction(t.id));
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

    const saved      = localStorage.getItem('finance_theme');
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
