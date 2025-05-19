// this is the backend code for the app

console.log("Starting server.js...");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("DEFAULT_REF_LINK:", process.env.DEFAULT_REF_LINK);
console.log("App initialized. Starting server...");

// ✅ Persistent Storage Paths
const storagePath = '/data';
const uploadsPath = path.join(storagePath, 'uploads');
const sessionsPath = path.join(storagePath, 'sessions');
const dataFilePath = path.join(storagePath, 'data.json');
const lastIdFilePath = path.join(storagePath, 'lastId.json');

// ✅ Ensure directories exist
[storagePath, uploadsPath, sessionsPath].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ✅ Initialize data.json and lastId.json if they don't exist
if (!fs.existsSync(dataFilePath)) fs.writeFileSync(dataFilePath, JSON.stringify([]));
if (!fs.existsSync(lastIdFilePath)) fs.writeFileSync(lastIdFilePath, '0');

// ✅ Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Static Files
app.use('/uploads', express.static(uploadsPath));
app.use(express.static('public', {
    index: false,
    extensions: ['html']
}));

// ✅ Session Middleware
app.use(session({
    store: new FileStore({ path: sessionsPath }),
    secret: 'lucky',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ✅ Auth Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user === "ggyy") return next();
    return res.redirect('/login.html');
}

// ✅ Serve admin.html only if authenticated
app.get('/admin.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ✅ Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "ggyy" && password === "aa123123") {
        req.session.user = username;
        return res.redirect("/admin.html");
    }
    return res.redirect("/login.html?error=1");
});

// ✅ Logout
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ✅ Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ✅ Utility
function getNextId() {
    let lastId = parseInt(fs.readFileSync(lastIdFilePath, 'utf8')) || 0;
    lastId += 1;
    fs.writeFileSync(lastIdFilePath, lastId.toString());
    return lastId;
}

// ✅ Public Data
app.get('/data.json', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error reading data file' });
    }
});

// ✅ Add Content (Protected)
app.post('/add-content', isAuthenticated, upload.single('image'), (req, res) => {
    const { username, description, link, amount } = req.body;
    const referralLink = link && link.trim() !== '' ? link.trim() : process.env.DEFAULT_REF_LINK;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';

    const newContent = {
        id: getNextId(),
        username: username.trim(),
        description: description.trim(),
        link: referralLink,
        imageUrl,
        amount: amount ? parseFloat(amount) : null
    };

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        data.push(newContent);
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
        res.json({ success: true, message: 'Content added successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Error adding content' });
    }
});

// ✅ Update Content (Protected)
app.put('/update/:id', isAuthenticated, upload.single('image'), (req, res) => {
    const contentId = parseInt(req.params.id);
    const { username, description, link, amount } = req.body;
    const newImageFile = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        const index = data.findIndex(item => item.id === contentId);

        if (index !== -1) {
            const existing = data[index];

            if (newImageFile) {
                const oldPath = path.join(uploadsPath, path.basename(existing.imageUrl));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                existing.imageUrl = newImageFile;
            }

            existing.username = username.trim();
            existing.description = description.trim();
            existing.link = link && link.trim() !== '' ? link.trim() : process.env.DEFAULT_REF_LINK;
            existing.amount = amount ? parseFloat(amount) : null;

            data[index] = existing;
            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
            res.json({ success: true, message: 'Content updated successfully' });
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error updating content' });
    }
});

// ✅ Delete Content (Protected)
app.delete('/delete/:id', isAuthenticated, (req, res) => {
    const contentId = parseInt(req.params.id);

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        const index = data.findIndex(item => item.id === contentId);

        if (index !== -1) {
            const removed = data.splice(index, 1)[0];

            if (removed.imageUrl) {
                const filePath = path.join(uploadsPath, path.basename(removed.imageUrl));
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }

            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
            res.json({ success: true, message: 'Content deleted successfully' });
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error deleting content' });
    }
});

// ✅ Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
