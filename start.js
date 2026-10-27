// ============================================================
//  scripts/start.js
//  ------------------------------------------------------------
//  Single entry point for the whole project.
//    1. Compiles the C++ analyzer if it hasn't been built yet.
//    2. Starts the Express server (which serves the frontend
//       and exposes the /analyze, /history APIs).
//
//  This is what `npm start` runs, so the whole app comes up
//  with one command after a one-time `npm install`.
// ============================================================

const { ensureAnalyzer } = require('./build');

try {
    ensureAnalyzer(false); // only builds if the binary is missing
} catch (err) {
    console.error('\n' + err.message + '\n');
    process.exit(1);
}

// Starting server.js runs its own app.listen(...) call, so simply
// requiring it here brings the whole server up.
require('../server/server.js');
