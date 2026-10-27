// ============================================================
//  server.js
//  ------------------------------------------------------------
//  Express server for LexiScan.
//
//  Responsibilities:
//    1. Serve the static frontend (HTML/CSS/JS) on localhost.
//    2. POST /analyze   -> accepts either an uploaded .c/.cpp file
//                          (multipart field "file") or raw pasted
//                          code (JSON body { "code": "..." }),
//                          writes it to a temp file, runs the
//                          compiled C++ analyzer on it, and
//                          returns its JSON output to the client.
//    3. GET  /history    -> lists past analysis reports saved in /reports
//    4. GET  /history/:file -> returns one saved report's JSON
//
//  The C++ analyzer is a separate compiled executable; this
//  server never parses C++ itself, it only shells out to it via
//  child_process.execFile() and forwards the JSON result.
// ============================================================

const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories used by the server (created if missing).
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

for (const dir of [UPLOADS_DIR, REPORTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// The compiled C++ analyzer. On Windows g++ produces analyzer.exe,
// on Linux/Mac it produces a plain "analyzer" executable.
function getAnalyzerPath() {
    const exeName = os.platform() === 'win32' ? 'analyzer.exe' : 'analyzer';
    return path.join(BACKEND_DIR, exeName);
}

// ---- middleware ----
app.use(express.json({ limit: '5mb' }));           // for raw pasted code
app.use(express.static(FRONTEND_DIR));              // serves index.html, style.css, script.js

// Multer: stores uploaded .c/.cpp files straight into uploads/
const upload = multer({
    dest: UPLOADS_DIR,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
    fileFilter: (req, file, cb) => {
        const allowed = ['.c', '.cpp', '.cc', '.h', '.hpp', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    }
});

// ------------------------------------------------------------
// Runs the compiled analyzer on a given source file path and
// resolves with the parsed JSON result.
// ------------------------------------------------------------
function runAnalyzer(sourceFilePath) {
    return new Promise((resolve, reject) => {
        const analyzerPath = getAnalyzerPath();

        if (!fs.existsSync(analyzerPath)) {
            reject(new Error(
                `Analyzer executable not found at ${analyzerPath}. ` +
                `Build it first (see README: g++ -std=c++17 -O2 -o analyzer analyzer.cpp Lexer.cpp Token.cpp).`
            ));
            return;
        }

        execFile(analyzerPath, [sourceFilePath], { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) => {
            if (err) {
                // The analyzer prints a small JSON error object to stderr on failure.
                try {
                    resolve(Object.assign({ ok: false }, JSON.parse(stderr)));
                } catch {
                    reject(new Error(stderr || err.message));
                }
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (parseErr) {
                reject(new Error('Failed to parse analyzer output as JSON: ' + parseErr.message));
            }
        });
    });
}

// Saves a copy of a completed analysis into /reports for the
// "recent analysis history" feature, and returns its filename.
function saveReportCopy(result, originalName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (originalName || 'pasted-code').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `${timestamp}_${safeName}.json`;
    const fullResult = Object.assign({ savedAt: new Date().toISOString(), sourceName: originalName || 'Pasted Code' }, result);
    fs.writeFileSync(path.join(REPORTS_DIR, filename), JSON.stringify(fullResult, null, 2));
    return filename;
}

// ------------------------------------------------------------
// POST /analyze
//   - multipart/form-data with field "file"  -> uploaded .c/.cpp file
//   - application/json with { "code": "..." } -> pasted source code
// ------------------------------------------------------------
app.post('/analyze', upload.single('file'), async (req, res) => {
    let tempFilePath = null;
    let originalName = null;

    try {
        if (req.file) {
            // Uploaded file: multer already saved it under uploads/
            tempFilePath = req.file.path;
            originalName = req.file.originalname;
        } else if (req.body && typeof req.body.code === 'string') {
            // Raw pasted code: write it to a temp file so the C++
            // executable (which reads from a file path) can use it.
            const code = req.body.code;
            if (!code.trim()) {
                return res.status(400).json({ ok: false, error: 'No source code provided.' });
            }
            const tempName = `pasted_${crypto.randomUUID()}.cpp`;
            tempFilePath = path.join(UPLOADS_DIR, tempName);
            fs.writeFileSync(tempFilePath, code);
            originalName = req.body.filename || 'pasted-code.cpp';
        } else {
            return res.status(400).json({ ok: false, error: 'No file or code provided.' });
        }

        const result = await runAnalyzer(tempFilePath);
        result.ok = true;

        const reportFile = saveReportCopy(result, originalName);
        result.reportFile = reportFile;

        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    } finally {
        // Clean up the temp source file (keep only the JSON report copy).
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, () => {});
        }
    }
});

// ------------------------------------------------------------
// GET /history - list saved reports, most recent first
// ------------------------------------------------------------
app.get('/history', (req, res) => {
    try {
        const files = fs.readdirSync(REPORTS_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()
            .slice(0, 20)
            .map(f => {
                const stat = fs.statSync(path.join(REPORTS_DIR, f));
                return { filename: f, savedAt: stat.mtime };
            });
        res.json({ ok: true, history: files });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ------------------------------------------------------------
// GET /history/:file - fetch one saved report by filename
// ------------------------------------------------------------
app.get('/history/:file', (req, res) => {
    const safe = path.basename(req.params.file); // prevent path traversal
    const fullPath = path.join(REPORTS_DIR, safe);
    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ ok: false, error: 'Report not found.' });
    }
    res.sendFile(fullPath);
});

// ------------------------------------------------------------
// Health check
// ------------------------------------------------------------
app.get('/health', (req, res) => {
    res.json({ ok: true, analyzerExists: fs.existsSync(getAnalyzerPath()) });
});

app.listen(PORT, () => {
    console.log(`\n  LexiScan server running at http://localhost:${PORT}\n`);
    console.log(`  Analyzer executable expected at: ${getAnalyzerPath()}`);
    console.log(`  (exists: ${fs.existsSync(getAnalyzerPath())})\n`);
});
