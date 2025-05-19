// server.js
console.log("Starting server.js…");

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ———————————————————————————————————————
//  Configuration
// ———————————————————————————————————————
const ADMIN_USER     = process.env.ADMIN_USER     || 'ggyy';
const ADMIN_PASS     = process.env.ADMIN_PASS     || 'aa123123';
const DEFAULT_REF    = process.env.DEFAULT_REF_LINK || 'https://example.com/default123';

// ———————————————————————————————————————
//  Paths & Storage Setup
// ———————————————————————————————————————
const baseDir       = __dirname;
const storageDir    = path.join(baseDir, 'data');
const uploadsDir    = path.join(storageDir, 'uploads');
const sessionsDir   = path.join(storageDir, 'sessions');
const dataFile      = path.join(storageDir, 'data.json');
const lastIdFile    = path.join(storageDir, 'lastId.json');
const publicDir     = path.join(baseDir, 'public');
const protectedDir  = path.join(baseDir, 'protected');

// Ensure our directories exist
[ storageDir, uploadsDir, sessionsDir ].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize JSON files if missing
if (!fs.existsSync(dataFile))   fs.writeFileSync(dataFile,   '[]');
if (!fs.existsSync(lastIdFile)) fs.writeFileSync(lastIdFile, '0');

// ———————————————————————————————————————
//  Helpers
// ———————————————————————————————————————
function getNextId() {
  let last = parseInt(fs.readFileSync(lastIdFile, 'utf8'), 10) || 0;
  last += 1;
  fs.writeFileSync(lastIdFile, last.toString());
  return last;
}

function isAuthenticated(req, res, next) {
  if (req.session.user === ADMIN_USER) return next();
  res.redirect('/login.html');
}

// ———————————————————————————————————————
//  Middleware
// ———————————————————————————————————————
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions (file-backed)
app.use(session({
  store: new FileStore({ path: sessionsDir }),
  secret: process.env.SESSION_SECRET || 'lucky',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Serve uploads
app.use('/uploads', express.static(uploadsDir));

// Serve public pages (index, login, terms, privacy, etc.)
app.use(express.static(publicDir, {
  index: false,
  extensions: ['html']
}));

// Redirect root → index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ———————————————————————————————————————
//  Authentication Routes
// ———————————————————————————————————————
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = username;
    return res.redirect('/admin.html');
  }
  res.redirect('/login.html?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid');
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    res.json({ success: true });
  });
});

// Protect admin.html
app.get('/admin.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(protectedDir, 'admin.html'));
});

// ———————————————————————————————————————
//  Multer File Uploads
// ———————————————————————————————————————
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

// ———————————————————————————————————————
//  Data API
// ———————————————————————————————————————
// Fetch all content
app.get('/data.json', (req, res) => {
  try {
    const all = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    res.json(all);
  } catch {
    res.status(500).json({ error: 'Error reading data file' });
  }
});

// Add content (protected)
app.post('/add-content', isAuthenticated, upload.single('image'), (req, res) => {
  const { username, description, link, amount } = req.body;
  const referral = link?.trim() || DEFAULT_REF;
  if (!username?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Username and description required' });
  }

  const entry = {
    id:         getNextId(),
    username:   username.trim(),
    description:description.trim(),
    link:       referral,
    imageUrl:   req.file ? `/uploads/${req.file.filename}` : '',
    amount:     amount ? parseFloat(amount) : null
  };

  try {
    const arr = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    arr.push(entry);
    fs.writeFileSync(dataFile, JSON.stringify(arr, null, 2));
    res.json({ success: true, message: 'Content added', entry });
  } catch {
    res.status(500).json({ error: 'Error adding content' });
  }
});

// Update content (protected)
app.put('/update/:id', isAuthenticated, upload.single('image'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { username, description, link, amount } = req.body;
  const newImage = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const arr = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const idx = arr.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const item = arr[idx];
    if (newImage) {
      // remove old file
      const oldPath = path.join(uploadsDir, path.basename(item.imageUrl));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      item.imageUrl = newImage;
    }
    item.username    = username.trim();
    item.description = description.trim();
    item.link        = link?.trim() || DEFAULT_REF;
    item.amount      = amount ? parseFloat(amount) : null;

    arr[idx] = item;
    fs.writeFileSync(dataFile, JSON.stringify(arr, null, 2));
    res.json({ success: true, message: 'Content updated', item });

  } catch {
    res.status(500).json({ error: 'Error updating content' });
  }
});

// Delete content (protected)
app.delete('/delete/:id', isAuthenticated, (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const arr = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const idx = arr.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });

    const [removed] = arr.splice(idx, 1);
    if (removed.imageUrl) {
      const filePath = path.join(uploadsDir, path.basename(removed.imageUrl));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    fs.writeFileSync(dataFile, JSON.stringify(arr, null, 2));
    res.json({ success: true, message: 'Content deleted' });
  } catch {
    res.status(500).json({ error: 'Error deleting content' });
  }
});

// ———————————————————————————————————————
//  Start
// ———————————————————————————————————————
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
