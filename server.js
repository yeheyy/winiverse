// server.js
console.log("Starting server.js…");

require('dotenv').config();
const express       = require('express');
const session       = require('express-session');
const FileStore     = require('session-file-store')(session);
const fs            = require('fs');
const path          = require('path');
const multer        = require('multer');

const app  = express();
const PORT = process.env.PORT || 3000;

// ————————————————————————————————
// CONFIGURATION
// ————————————————————————————————
const ADMIN_USER     = process.env.ADMIN_USER || 'ggyy';
const ADMIN_PASS     = process.env.ADMIN_PASS || 'aa123123';
const DEFAULT_REF    = process.env.DEFAULT_REF_LINK || 'https://example.com/default123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'lucky';

// ————————————————————————————————
// PATHS (Render Persistent Storage)
// ————————————————————————————————
const dataRoot    = '/data'; // Render’s persistent disk
const uploadsDir  = path.join(dataRoot, 'uploads');
const sessionsDir = path.join(dataRoot, 'sessions');
const dataFile    = path.join(dataRoot, 'data.json');
const lastIdFile  = path.join(dataRoot, 'lastId.json');

const baseDir      = __dirname;
const publicDir    = path.join(baseDir, 'public');
const protectedDir = path.join(baseDir, 'protected');

// ————————————————————————————————
// INITIALIZE DIRECTORIES
// ————————————————————————————————
[uploadsDir, sessionsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

if (!fs.existsSync(dataFile))    fs.writeFileSync(dataFile, '[]');
if (!fs.existsSync(lastIdFile))  fs.writeFileSync(lastIdFile, '0');

// ————————————————————————————————
// HELPERS
// ————————————————————————————————
function getNextId() {
  let last = parseInt(fs.readFileSync(lastIdFile, 'utf8'), 10) || 0;
  last += 1;
  fs.writeFileSync(lastIdFile, last.toString());
  return last;
}

function isAuthenticated(req, res, next) {
  if (req.session.user === ADMIN_USER) return next();
  return res.redirect('/login.html');
}

// ————————————————————————————————
// MIDDLEWARE
// ————————————————————————————————
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session Setup
app.use(session({
  store: new FileStore({ path: sessionsDir }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Static assets and uploads
app.use('/css', express.static(path.join(publicDir, 'css')));
app.use('/uploads', express.static(uploadsDir));

// ————————————————————————————————
// ROUTES – HTML Pages
// ————————————————————————————————
app.get('/',             (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.get('/login.html',   (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
app.get('/terms.html',   (req, res) => res.sendFile(path.join(publicDir, 'terms.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));

// Admin page protected
app.get('/admin.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(protectedDir, 'admin.html'));
});

// ————————————————————————————————
// AUTH ROUTES
// ————————————————————————————————
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = username;
    return res.redirect('/admin.html');
  }
  return res.redirect('/login.html?error=1');
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('connect.sid');
    if (err) return res.status(500).json({ success: false, message: 'Logout failed' });
    res.json({ success: true });
  });
});

// ————————————————————————————————
// UPLOADS SETUP
// ————————————————————————————————
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

// ————————————————————————————————
// DATA API
// ————————————————————————————————
app.get('/data.json', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.post('/add-content', isAuthenticated, upload.single('image'), (req, res) => {
  const { username, description, link, amount } = req.body;
  if (!username?.trim() || !description?.trim()) {
    return res.status(400).json({ error: 'Username and description required' });
  }

  const newEntry = {
    id: getNextId(),
    username: username.trim(),
    description: description.trim(),
    link: (link || '').trim() || DEFAULT_REF,
    imageUrl: req.file ? `/uploads/${req.file.filename}` : '',
    amount: amount ? parseFloat(amount) : null
  };

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    data.push(newEntry);
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Content added', newEntry });
  } catch {
    res.status(500).json({ error: 'Failed to add content' });
  }
});

app.put('/update/:id', isAuthenticated, upload.single('image'), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { username, description, link, amount } = req.body;
  const newImage = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'Content not found' });

    const item = data[index];
    if (newImage) {
      const oldPath = path.join(uploadsDir, path.basename(item.imageUrl));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      item.imageUrl = newImage;
    }

    item.username    = username.trim();
    item.description = description.trim();
    item.link        = (link || '').trim() || DEFAULT_REF;
    item.amount      = amount ? parseFloat(amount) : null;

    data[index] = item;
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Content updated', item });

  } catch {
    res.status(500).json({ error: 'Failed to update content' });
  }
});

app.delete('/delete/:id', isAuthenticated, (req, res) => {
  const id = parseInt(req.params.id, 10);

  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return res.status(404).json({ error: 'Content not found' });

    const [removed] = data.splice(index, 1);
    if (removed.imageUrl) {
      const imgPath = path.join(uploadsDir, path.basename(removed.imageUrl));
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true, message: 'Content deleted' });

  } catch {
    res.status(500).json({ error: 'Failed to delete content' });
  }
});

// ————————————————————————————————
// START SERVER
// ————————————————————————————————
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
