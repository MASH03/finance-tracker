const workerCode = `
    self.onmessage = function(e) {
        const { transactions, query } = e.data;
        
        let filtered = transactions;
        if (query && query.trim() !== '') {
            const lowerQuery = query.toLowerCase();
            filtered = transactions.filter(t => 
                t.description.toLowerCase().includes(lowerQuery) ||
                t.amount.toString().includes(lowerQuery)
            );
        }
        
        filtered.sort((a, b) => b.id - a.id);
        
        self.postMessage({ filtered });
    };
`;

class FinanceTracker {
    constructor() {
        this.STORAGE_KEY = 'finance_transactions';
        this.transactions = JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];

        this.form = document.getElementById('transactionForm');
        this.descInput = document.getElementById('desc');
        this.amountInput = document.getElementById('amount');
        this.searchInput = document.getElementById('searchInput');
        this.listEl = document.getElementById('transactionList');

        this.balEl = document.getElementById('totalBalance');
        this.incEl = document.getElementById('totalIncome');
        this.expEl = document.getElementById('totalExpenses');

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));

        this.worker.onmessage = (e) => {
            this.renderList(e.data.filtered);
        };

        this.searchTimeout = null;

        this.init();
    }

    init() {
        this.form.addEventListener('submit', (e) => this.addTransaction(e));

        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            this.searchTimeout = setTimeout(() => {
                this.requestFiltered(e.target.value);
            }, 300);
        });

        this.updateTotals();
        this.requestFiltered('');
    }

    requestFiltered(query) {
        this.worker.postMessage({
            transactions: this.transactions,
            query: query
        });
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.transactions));
        this.updateTotals();
        this.requestFiltered(this.searchInput.value);
    }

    addTransaction(e) {
        e.preventDefault();

        const description = this.descInput.value.trim();
        const amount = parseFloat(this.amountInput.value);
        const type = document.querySelector('input[name="type"]:checked').value;

        if (!description || isNaN(amount) || amount <= 0) return;

        const newTrans = {
            id: Date.now(),
            description,
            amount,
            type
        };

        this.transactions.push(newTrans);
        this.save();

        this.form.reset();
        document.querySelector('input[name="type"][value="income"]').checked = true;
    }

    deleteTransaction(id) {
        this.transactions = this.transactions.filter(t => t.id !== id);
        this.save();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-PH', {
            style: 'currency',
            currency: 'PHP'
        }).format(amount);
    }

    updateTotals() {
        const totals = this.transactions.reduce((acc, t) => {
            if (t.type === 'income') {
                acc.income += t.amount;
                acc.balance += t.amount;
            } else {
                acc.expense += t.amount;
                acc.balance -= t.amount;
            }
            return acc;
        }, { income: 0, expense: 0, balance: 0 });

        this.balEl.textContent = this.formatCurrency(totals.balance);
        this.incEl.textContent = this.formatCurrency(totals.income);
        this.expEl.textContent = this.formatCurrency(totals.expense);
    }

    renderList(transactions) {
        this.listEl.innerHTML = '';

        if (transactions.length === 0) {
            this.listEl.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-muted-foreground">No transactions found.</td></tr>';
            return;
        }

        transactions.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = 'animate-fade-in group';

            const isIncome = t.type === 'income';

            tr.innerHTML = `
                <td class="px-4 py-3 font-medium">${t.description}</td>
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

            const delBtn = tr.querySelector('button');
            delBtn.addEventListener('click', () => this.deleteTransaction(t.id));

            this.listEl.appendChild(tr);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new FinanceTracker();
    initTheme();
});

function initTheme() {
    const html = document.documentElement;
    const btn = document.getElementById('themeToggle');
    const iconSun = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    const label = document.getElementById('themeLabel');

    const saved = localStorage.getItem('finance_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;

    applyTheme(isDark);

    btn.addEventListener('click', () => {
        const currentlyDark = html.classList.contains('dark');
        applyTheme(!currentlyDark);
        localStorage.setItem('finance_theme', !currentlyDark ? 'dark' : 'light');
    });

    function applyTheme(dark) {
        if (dark) {
            html.classList.add('dark');
            iconSun.style.display = 'block';
            iconMoon.style.display = 'none';
            label.textContent = 'Light Mode';
        } else {
            html.classList.remove('dark');
            iconSun.style.display = 'none';
            iconMoon.style.display = 'block';
            label.textContent = 'Dark Mode';
        }
    }
}
