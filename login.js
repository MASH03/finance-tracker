// ─── Rate Limiter ─────────────────────────────────────────────────────────────
// Limits login attempts to MAX_ATTEMPTS per WINDOW_MS to slow brute-force.
const RateLimiter = {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 30_000, // 30 seconds
    KEY: 'login_attempts',

    _getState() {
        try {
            return JSON.parse(sessionStorage.getItem(this.KEY)) ?? { count: 0, windowStart: Date.now() };
        } catch {
            return { count: 0, windowStart: Date.now() };
        }
    },

    _setState(state) {
        sessionStorage.setItem(this.KEY, JSON.stringify(state));
    },

    /** Returns { allowed: true } or { allowed: false, waitSeconds: N } */
    check() {
        const state = this._getState();
        const now = Date.now();

        // Reset window if expired
        if (now - state.windowStart > this.WINDOW_MS) {
            this._setState({ count: 0, windowStart: now });
            return { allowed: true };
        }

        if (state.count >= this.MAX_ATTEMPTS) {
            const waitSeconds = Math.ceil((this.WINDOW_MS - (now - state.windowStart)) / 1000);
            return { allowed: false, waitSeconds };
        }

        return { allowed: true };
    },

    /** Call after every failed attempt */
    recordFailure() {
        const state = this._getState();
        const now = Date.now();
        if (now - state.windowStart > this.WINDOW_MS) {
            this._setState({ count: 1, windowStart: now });
        } else {
            this._setState({ ...state, count: state.count + 1 });
        }
    },

    /** Call after a successful login */
    reset() {
        sessionStorage.removeItem(this.KEY);
    }
};

// ─── Validation Helper ────────────────────────────────────────────────────────
function validateLoginInputs(email, password) {
    if (!email || !password) {
        return 'Email and password are required.';
    }
    // Basic email format check (RFC 5322 simplified)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return 'Please enter a valid email address.';
    }
    if (email.length > 254) {
        return 'Email address is too long.';
    }
    if (password.length < 6) {
        return 'Password must be at least 6 characters.';
    }
    return null; // null = no error
}

// ─── Main ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect if already logged in
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
        return;
    }

    const loginForm     = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg      = document.getElementById('errorMsg');
    const submitBtn     = loginForm.querySelector('button[type="submit"]');

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }

    function clearError() {
        errorMsg.style.display = 'none';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        // ── Rate limit check ──────────────────────────────────────────────────
        const limit = RateLimiter.check();
        if (!limit.allowed) {
            showError(`Too many attempts. Please wait ${limit.waitSeconds} second(s).`);
            return;
        }

        const email    = usernameInput.value.trim();
        const password = passwordInput.value;

        // ── Client-side validation ────────────────────────────────────────────
        const validationError = validateLoginInputs(email, password);
        if (validationError) {
            showError(validationError);
            return;
        }

        // ── Disable button while request is in-flight ─────────────────────────
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';

        const { data, error } = await sb.auth.signInWithPassword({ email, password });

        if (error) {
            RateLimiter.recordFailure();
            // Show a generic error — avoid leaking whether email or password was wrong
            showError('Invalid email or password. Please try again.');
            passwordInput.value = '';
            passwordInput.focus();
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
            return;
        }

        RateLimiter.reset();
        window.location.href = 'index.html';
    });

    [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('input', clearError);
    });

    initTheme();
});

// ─── Theme ────────────────────────────────────────────────────────────────────
function initTheme() {
    const html     = document.documentElement;
    const btn      = document.getElementById('themeToggle');
    const iconSun  = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    const label    = document.getElementById('themeLabel');

    if (!btn) return;

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
        if (iconSun)  iconSun.style.display  = dark ? 'block' : 'none';
        if (iconMoon) iconMoon.style.display = dark ? 'none'  : 'block';
        if (label)    label.textContent      = dark ? 'Light Mode' : 'Dark Mode';
    }
}
