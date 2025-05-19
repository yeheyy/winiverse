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

// ✅ Static Files Middleware
app.use('/uploads', express.static(uploadsPath));
app.use(express.static('public', {
    index: false,
    extensions: ['html']
}));

// ✅ Session Middleware with FileStore
app.use(session({
    store: new FileStore({ path: sessionsPath }),
    secret: 'lucky',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// ✅ Authentication Middleware
function isAuthenticated(req, res, next) {
    if (req.session.user === "ggyy") return next();
    return res.redirect('/login.html');
}

// ✅ Protect admin.html
app.get('/admin.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ✅ Login Route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === "ggyy" && password === "aa123123") {
        req.session.user = username;
        return res.redirect("/admin.html");
    }
    return res.redirect("/login.html?error=1");
});

// ✅ Logout Route
app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ✅ Multer Setup for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// ✅ Get Next ID
function getNextId() {
    let lastId = parseInt(fs.readFileSync(lastIdFilePath, 'utf8')) || 0;
    lastId += 1;
    fs.writeFileSync(lastIdFilePath, lastId.toString());
    return lastId;
}

// ✅ Fetch All Content
app.get('/data.json', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Error reading data file' });
    }
});

// ✅ Add New Content
app.post('/add-content', upload.single('image'), (req, res) => {
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

// ✅ Update Content
app.put('/update/:id', upload.single('image'), (req, res) => {
    const contentId = parseInt(req.params.id);
    const { username, description, link, amount } = req.body;
    const newImageFile = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        const contentIndex = data.findIndex(item => item.id === contentId);

        if (contentIndex !== -1) {
            const existingContent = data[contentIndex];

            if (newImageFile) {
                const oldImagePath = path.join(uploadsPath, path.basename(existingContent.imageUrl));
                if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
                existingContent.imageUrl = newImageFile;
            }

            existingContent.username = username.trim();
            existingContent.description = description.trim();
            existingContent.link = link && link.trim() !== '' ? link.trim() : process.env.DEFAULT_REF_LINK;
            existingContent.amount = amount ? parseFloat(amount) : null;

            data[contentIndex] = existingContent;
            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

            res.json({ success: true, message: 'Content updated successfully' });
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Error updating content' });
    }
});

// ✅ Delete Content
app.delete('/delete/:id', (req, res) => {
    const contentId = parseInt(req.params.id);

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        const contentIndex = data.findIndex(item => item.id === contentId);

        if (contentIndex !== -1) {
            const removedContent = data.splice(contentIndex, 1)[0];

            if (removedContent.imageUrl) {
                const filePath = path.join(uploadsPath, path.basename(removedContent.imageUrl));
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

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
