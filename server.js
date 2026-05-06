const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const dbPath = path.resolve(__dirname, 'finance.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Initialize tables in sequence
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            `);
            db.run(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    description TEXT NOT NULL,
                    amount REAL NOT NULL,
                    type TEXT NOT NULL,
                    date TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);
        });
    }
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (username.trim().length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const date = new Date().toISOString();
        db.run(
            'INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)',
            [username.trim(), hashedPassword, date],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        return res.status(409).json({ error: 'Username already taken.' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, username: username.trim() });
            }
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username.trim()], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid username or password.' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid username or password.' });

        res.json({ id: user.id, username: user.username });
    });
});

// ─── Transaction Routes ───────────────────────────────────────────────────────

// Get all transactions for a user
app.get('/api/transactions', (req, res) => {
    const userId = req.query.user_id;
    const query = req.query.q || '';

    if (!userId) return res.status(400).json({ error: 'user_id is required.' });

    let sql = 'SELECT * FROM transactions WHERE user_id = ?';
    let params = [userId];

    if (query.trim() !== '') {
        sql += ' AND (description LIKE ? OR CAST(amount AS TEXT) LIKE ?)';
        const q = `%${query}%`;
        params.push(q, q);
    }

    sql += ' ORDER BY id DESC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json(rows);
    });
});

// Add a transaction
app.post('/api/transactions', (req, res) => {
    const { user_id, description, amount, type, date } = req.body;
    if (!user_id || !description || !amount || !type || !date) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    const sql = 'INSERT INTO transactions (user_id, description, amount, type, date) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [user_id, description, amount, type, date], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, user_id, description, amount, type, date });
    });
});

// Delete a transaction
app.delete('/api/transactions/:id', (req, res) => {
    db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: 'deleted', changes: this.changes });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
