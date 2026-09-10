const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Kata sandi admin
const ADMIN_PASSWORD = 'adminrahasia123';

// Konfigurasi folder penyimpanan gambar
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Batas ukuran 5MB
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database SQLite
const db = new sqlite3.Database('./orders.db');

db.run(`
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        imei TEXT NOT NULL,
        package TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        imagePath TEXT
    )
`, () => {
    // Tambah kolom imagePath secara otomatis jika database lama sudah ada
    db.run(`ALTER TABLE orders ADD COLUMN imagePath TEXT`, (err) => {});
});

// 1. Simpan Pesanan Baru dengan Unggah Gambar (Publik)
app.post('/api/orders', upload.single('image'), (req, res) => {
    const { name, phone, imei, packageType } = req.body;

    if (!imei || imei.length !== 15 || isNaN(imei)) {
        return res.status(400).json({ success: false, message: 'Nomor IMEI harus berupa 15 digit angka!' });
    }

    const priceList = {
        '1 Bulan Fast (1 Jam)': 200000,
        '3 Bulan Slow (1-2x24 Jam)': 200000,
        '3 Bulan Fast (30 Menit - 1 Jam)': 250000
    };

    const price = priceList[packageType] || 200000;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const newOrder = {
        id: 'INV-' + Date.now().toString().slice(-6),
        name,
        phone,
        imei,
        package: packageType,
        price,
        status: 'Menunggu Pembayaran',
        createdAt: new Date().toLocaleString('id-ID'),
        imagePath
    };

    const sql = `INSERT INTO orders (id, name, phone, imei, package, price, status, createdAt, imagePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [newOrder.id, newOrder.name, newOrder.phone, newOrder.imei, newOrder.package, newOrder.price, newOrder.status, newOrder.createdAt, newOrder.imagePath], (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Gagal menyimpan pesanan ke database.' });
        }
        res.json({
            success: true,
            message: 'Pesanan berhasil dibuat!',
            order: newOrder
        });
    });
});

// 2. Lacak Pesanan Berdasarkan ID (Publik)
app.get('/api/orders/:id', (req, res) => {
    const orderId = req.params.id.trim();
    const sql = `SELECT * FROM orders WHERE LOWER(id) = LOWER(?)`;

    db.get(sql, [orderId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ success: false, message: 'Nomor pesanan tidak ditemukan!' });
        }
        res.json({
            success: true,
            order: {
                id: row.id,
                package: row.package,
                price: row.price,
                status: row.status,
                createdAt: row.createdAt
            }
        });
    });
});

// Middleware Verifikasi Kata Sandi Admin
function checkAdminAuth(req, res, next) {
    const authHeader = req.headers['x-admin-password'];
    if (authHeader !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Akses ditolak: Kata sandi salah!' });
    }
    next();
}

// Endpoint Verifikasi Login Admin
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Kata sandi admin salah!' });
    }
});

// 3. Ambil Semua Pesanan (Khusus Admin)
app.get('/api/admin/orders', checkAdminAuth, (req, res) => {
    db.all(`SELECT * FROM orders ORDER BY rowid DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Gagal mengambil data.' });
        }
        res.json(rows);
    });
});

// 4. Perbarui Status Pesanan (Khusus Admin)
app.post('/api/admin/orders/update-status', checkAdminAuth, (req, res) => {
    const { id, status } = req.body;
    const sql = `UPDATE orders SET status = ? WHERE id = ?`;

    db.run(sql, [status, id], function (err) {
        if (err || this.changes === 0) {
            return res.status(400).json({ success: false, message: 'Gagal memperbarui status.' });
        }
        res.json({ success: true, message: 'Status berhasil diperbarui!' });
    });
});

app.listen(PORT, () => {
    console.log(`Server aktif di http://localhost:${PORT}`);
});
