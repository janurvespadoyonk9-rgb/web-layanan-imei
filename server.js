const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ================= CONFIG EMAIL NOTIFIKASI =================
const USER_GMAIL = 'janurvespadoyonk9@gmail.com'; // <-- Ganti dengan Gmail Anda
const APP_PASSWORD_GOOGLE = 'snzw kpel ukqh vgyd'; // <-- Ganti dengan 16 digit Sandi Aplikasi Anda
// ==========================================================

// Kata sandi admin
// MENJADI SEPERTI INI:
// Kata sandi admin
const ADMIN_PASSWORD = 'adminrahasia123';

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: USER_GMAIL,
        pass: APP_PASSWORD_GOOGLE.replace(/\s+/g, '')
    }
});

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

        // --- PROSES KIRIM NOTIFIKASI EMAIL ---
        const rincianEmail = `
            <div style="font-family: sans-serif; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; color: #1e293b;">
                <h2 style="color: #2563eb; margin-top: 0;">🔔 Ada Pesanan Baru Masuk!</h2>
                <p>Halo Admin, seseorang baru saja melakukan pemesanan di website Jasa IMEI.</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                    <tr><td style="padding: 4px 0; color: #64748b;">ID Pesanan:</td><td style="font-weight: bold;">${newOrder.id}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">Nama:</td><td style="font-weight: bold;">${newOrder.name}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">WhatsApp:</td><td><a href="https://wa.me/${newOrder.phone.replace(/[^0-9]/g, '')}" target="_blank">${newOrder.phone}</a></td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">IMEI:</td><td style="font-family: monospace;">${newOrder.imei}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">Paket:</td><td>${newOrder.package}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">Total Tagihan:</td><td style="color: #10b981; font-weight: bold;">Rp ${Number(newOrder.price).toLocaleString('id-ID')}</td></tr>
                    <tr><td style="padding: 4px 0; color: #64748b;">Tanggal:</td><td>${newOrder.createdAt}</td></tr>
                </table>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                <p style="font-size: 13px; color: #64748b; text-align: center;">Segera cek <a href="https://web-layanan-imei-production.up.railway.app/admin.html" target="_blank" style="color: #2563eb; font-weight: bold; text-decoration: none;">Dashboard Admin</a> untuk info lengkap.</p>
            </div>
        `;

        const mailOptions = {
            from: `"Notifikasi Web IMEI" <${USER_GMAIL}>`,
            to: USER_GMAIL, // Kirim ke email Anda sendiri
            subject: `🚨 PESANAN BARU: ${newOrder.id} - ${newOrder.name}`,
            html: rincianEmail
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('[-] Gagal mengirim email notifikasi:', error);
            } else {
                console.log('[+] Email notifikasi berhasil dikirim:', info.response);
            }
        });
        // -------------------------------------

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
