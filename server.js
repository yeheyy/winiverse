console.log("Starting server.js...");

// Load .env file at the top
require('dotenv').config();

const express = require('express');

const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express(); // Initialize `app` first
const PORT = process.env.PORT || 3000;

// Check if the .env value is loaded correctly
console.log("DEFAULT_REF_LINK:", process.env.DEFAULT_REF_LINK);

console.log("App initialized. Starting server...");

// ✅ Middleware Setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Session Middleware
app.use(session({
    secret: 'lucky',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }  // Set to true if using HTTPS
}));

// ✅ Static Files Middleware
app.use(express.static('public'));

// ✅ Login Route with Redirect to admin page
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt with:', username, password);

    if (username === 'ggyy' && password === 'aa123123') {
        req.session.user = { username };
        console.log('Login successful, redirecting to admin page...');
        return res.redirect('/admin.html'); // Change to your admin page path
    } else {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }
});


// ✅ Logout Route
app.post('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).json({ success: false, message: 'Logout failed' });
            }
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    } else {
        res.status(400).json({ success: false, message: 'No session to destroy' });
    }
});


// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const dataFilePath = path.join(__dirname, 'data.json');
const lastIdFilePath = path.join(__dirname, 'lastId.json');

// ✅ Multer Setup for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// ✅ Initialize data.json and lastId.json if they don't exist
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify([]));
}

if (!fs.existsSync(lastIdFilePath)) {
    fs.writeFileSync(lastIdFilePath, '0');
}

// ✅ Helper function to get the next ID
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
        console.error('Error reading data file:', err);
        res.status(500).json({ error: 'Error reading data file' });
    }
});

// ✅ Add New Content
app.post('/add-content', upload.single('image'), (req, res) => {
    const { username, description, link } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const referralLink = link && link.trim() !== '' ? link.trim() : process.env.DEFAULT_REF_LINK;

    if (!username || !description || !referralLink) {
        return res.status(400).json({ error: 'Username, description, and link are required' });
    }

    const newContent = {
        id: getNextId(),
        username: username.trim(),
        description: description.trim(),
        link: referralLink,
        imageUrl
    };

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        data.push(newContent);
        fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
        res.json({ success: true, message: 'Content added successfully', newContent });
    } catch (err) {
        console.error('Error adding content:', err);
        res.status(500).json({ error: 'Error adding content' });
    }
});

// ✅ Update Content
app.put('/update/:id', upload.single('image'), (req, res) => {
    const contentId = parseInt(req.params.id);
    const { username, description, link } = req.body;
    const newImageFile = req.file ? `/uploads/${req.file.filename}` : null;

    try {
        const data = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        const contentIndex = data.findIndex(item => item.id === contentId);

        if (contentIndex !== -1) {
            const existingContent = data[contentIndex];

            if (newImageFile) {
                const oldImagePath = path.join(__dirname, 'public', existingContent.imageUrl);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
                existingContent.imageUrl = newImageFile;
            }

            existingContent.username = username.trim();
            existingContent.description = description.trim();
            existingContent.link = link.trim() !== '' ? link.trim() : process.env.DEFAULT_REF_LINK;

            data[contentIndex] = existingContent;
            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));

            res.json({ success: true, message: 'Content updated successfully' });
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        console.error('Error updating content:', err);
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
                const filePath = path.join(__dirname, 'public', removedContent.imageUrl);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
            res.json({ success: true, message: 'Content deleted successfully' });
        } else {
            res.status(404).json({ error: 'Content not found' });
        }
    } catch (err) {
        console.error('Error deleting content:', err);
        res.status(500).json({ error: 'Error deleting content' });
    }
});

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
