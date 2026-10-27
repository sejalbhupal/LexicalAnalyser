// ============================================================
//  scripts/build.js
//  ------------------------------------------------------------
//  Compiles the C++ analyzer (backend/analyzer.cpp + Lexer.cpp
//  + Token.cpp) into a native executable using g++.
//
//  Exports ensureAnalyzer(forceRebuild), used by scripts/start.js
//  to auto-build the binary the first time `npm start` runs.
//  Can also be run directly: `npm run build` (always rebuilds).
// ============================================================

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const EXE_NAME = os.platform() === 'win32' ? 'analyzer.exe' : 'analyzer';
const ANALYZER_PATH = path.join(BACKEND_DIR, EXE_NAME);

function isCompilerAvailable() {
    try {
        execSync('g++ --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

// Compiles the analyzer if it doesn't exist yet (or if forceRebuild
// is true). Returns the path to the compiled executable.
function ensureAnalyzer(forceRebuild = false) {
    if (!forceRebuild && fs.existsSync(ANALYZER_PATH)) {
        return ANALYZER_PATH;
    }

    if (!isCompilerAvailable()) {
        throw new Error(
            'g++ was not found on your PATH. Install a C++ compiler first:\n' +
            '  Windows : install MinGW-w64 (or MSYS2) and add its bin/ folder to PATH\n' +
            '  macOS   : run  xcode-select --install\n' +
            '  Linux   : run  sudo apt install g++  (Debian/Ubuntu)\n' +
            'Then run  npm start  again.'
        );
    }

    console.log('Building C++ analyzer (backend/' + EXE_NAME + ')...');
    const cmd = `g++ -std=c++17 -O2 -o "${EXE_NAME}" analyzer.cpp Lexer.cpp Token.cpp`;

    try {
        execSync(cmd, { cwd: BACKEND_DIR, stdio: 'inherit' });
    } catch (err) {
        throw new Error('C++ build failed. See the compiler output above for details.');
    }

    if (!fs.existsSync(ANALYZER_PATH)) {
        throw new Error(`Build finished but ${ANALYZER_PATH} still wasn't found.`);
    }

    console.log('Build succeeded:', ANALYZER_PATH, '\n');
    return ANALYZER_PATH;
}

// Allow `npm run build` to invoke this file directly (always rebuilds).
if (require.main === module) {
    try {
        ensureAnalyzer(true);
    } catch (err) {
        console.error('\n' + err.message);
        process.exit(1);
    }
}

module.exports = { ensureAnalyzer, ANALYZER_PATH, EXE_NAME };
