document.addEventListener('DOMContentLoaded', async () => {
    // Check if already logged in
    const { data: { session } } = await sb.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
        return;
    }

    const registerForm = document.getElementById('registerForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = usernameInput.value.trim();
        const password = passwordInput.value;
        errorMsg.style.display = 'none';

        if (password.length < 6) {
            errorMsg.textContent = 'Password must be at least 6 characters.';
            errorMsg.style.display = 'block';
            return;
        }

        const { data, error } = await sb.auth.signUp({
            email: email,
            password: password
        });

        if (error) {
            errorMsg.textContent = error.message;
            errorMsg.style.display = 'block';
            return;
        }

        // Auto-login after registration
        window.location.href = 'index.html';
    });

    [usernameInput, passwordInput].forEach(input => {
        input.addEventListener('input', () => {
            errorMsg.style.display = 'none';
        });
    });

    initTheme();
});

function initTheme() {
    const html     = document.documentElement;
    const btn      = document.getElementById('themeToggle');
    const iconSun  = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    const label    = document.getElementById('themeLabel');

    if (!btn) return; // Guard clause

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
        if (iconSun) iconSun.style.display  = dark ? 'block' : 'none';
        if (iconMoon) iconMoon.style.display = dark ? 'none'  : 'block';
        if (label) label.textContent      = dark ? 'Light Mode' : 'Dark Mode';
    }
}
