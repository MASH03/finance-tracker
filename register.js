// ─── Validation Helper ────────────────────────────────────────────────────────
function validateRegisterInputs(email, password) {
    if (!email || !password) {
        return 'Email and password are required.';
    }
    // Basic email format check
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
    if (password.length > 72) {
        // bcrypt (used by Supabase) truncates at 72 bytes
        return 'Password must be 72 characters or fewer.';
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

    const registerForm  = document.getElementById('registerForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg      = document.getElementById('errorMsg');
    const submitBtn     = registerForm.querySelector('button[type="submit"]');

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }

    function clearError() {
        errorMsg.style.display = 'none';
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        const email    = usernameInput.value.trim();
        const password = passwordInput.value;

        // ── Client-side validation ────────────────────────────────────────────
        const validationError = validateRegisterInputs(email, password);
        if (validationError) {
            showError(validationError);
            return;
        }

        // ── Disable button while request is in-flight ─────────────────────────
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';

        const { data, error } = await sb.auth.signUp({ email, password });

        if (error) {
            // Use a generic message — do NOT echo back whether the email is already
            // registered, as that leaks user account information to an attacker.
            showError('Could not create account. Please try again or use a different email.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign Up';
            return;
        }

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
