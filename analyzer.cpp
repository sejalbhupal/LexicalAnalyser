// ============================================================
//  analyzer.cpp
//  ------------------------------------------------------------
//  Entry point of the LexiScan C++ backend.
//
//  Usage:
//      analyzer <path-to-source-file>
//
//  Reads the given source file, runs the Lexer over it, and
//  prints ONE JSON object to stdout describing:
//      - tokens[]        every token found (id, type, lexeme, line)
//      - statistics{}     counts used by the frontend's stat cards
//      - symbolTable[]     unique identifiers and where they occur
//      - errors[]           lexical errors (line + message)
//
//  The Node/Express server (server/server.js) spawns this
//  executable as a child process, reads its stdout, and forwards
//  the JSON straight to the browser.
// ============================================================

#include <iostream>
#include <fstream>
#include <sstream>
#include "Token.h"
#include "Lexer.h"

using namespace std;

// Reads an entire file into a string. Returns false if it can't be opened.
static bool readFile(const string& path, string& out) {
    ifstream file(path, ios::binary);
    if (!file.is_open()) return false;
    stringstream buffer;
    buffer << file.rdbuf();
    out = buffer.str();
    return true;
}

// Prints a JSON array of tokens.
static void printTokensJson(ostream& out, const vector<Token>& tokens) {
    out << "\"tokens\":[";
    for (size_t i = 0; i < tokens.size(); i++) {
        const Token& t = tokens[i];
        out << "{"
            << "\"id\":" << t.id << ","
            << "\"type\":\"" << escapeJson(tokenTypeToString(t.type)) << "\","
            << "\"lexeme\":\"" << escapeJson(t.lexeme) << "\","
            << "\"line\":" << t.line
            << "}";
        if (i + 1 < tokens.size()) out << ",";
    }
    out << "]";
}

// Prints the statistics object used to drive the dashboard's stat cards.
static void printStatisticsJson(ostream& out, const vector<Token>& tokens,
                                 int commentCount, int errorCount) {
    int keywords = 0, identifiers = 0, operators = 0, delimiters = 0, numbers = 0, strings = 0;

    for (const auto& t : tokens) {
        switch (t.type) {
            case TokenType::KEYWORD:        keywords++; break;
            case TokenType::IDENTIFIER:     identifiers++; break;
            case TokenType::ARITHMETIC_OP:
            case TokenType::RELATIONAL_OP:
            case TokenType::LOGICAL_OP:
            case TokenType::ASSIGNMENT_OP:
            case TokenType::BITWISE_OP:
            case TokenType::INC_DEC_OP:     operators++; break;
            case TokenType::DELIMITER:
            case TokenType::PREPROCESSOR:   delimiters++; break;
            case TokenType::INTEGER_CONST:
            case TokenType::FLOAT_CONST:    numbers++; break;
            case TokenType::STRING_LITERAL:
            case TokenType::CHAR_LITERAL:   strings++; break;
            default: break; // INVALID tokens are counted via errorCount instead
        }
    }

    out << "\"statistics\":{"
        << "\"keywords\":" << keywords << ","
        << "\"identifiers\":" << identifiers << ","
        << "\"operators\":" << operators << ","
        << "\"delimiters\":" << delimiters << ","
        << "\"numbers\":" << numbers << ","
        << "\"strings\":" << strings << ","
        << "\"comments\":" << commentCount << ","
        << "\"errors\":" << errorCount << ","
        << "\"totalTokens\":" << tokens.size()
        << "}";
}

static void printSymbolTableJson(ostream& out, const vector<SymbolEntry>& table) {
    out << "\"symbolTable\":[";
    for (size_t i = 0; i < table.size(); i++) {
        const SymbolEntry& s = table[i];
        out << "{"
            << "\"id\":" << s.id << ","
            << "\"name\":\"" << escapeJson(s.name) << "\","
            << "\"firstLine\":" << s.firstLine << ","
            << "\"occurrences\":" << s.occurrences
            << "}";
        if (i + 1 < table.size()) out << ",";
    }
    out << "]";
}

static void printErrorsJson(ostream& out, const vector<LexError>& errors) {
    out << "\"errors\":[";
    for (size_t i = 0; i < errors.size(); i++) {
        const LexError& e = errors[i];
        out << "{"
            << "\"line\":" << e.line << ","
            << "\"message\":\"" << escapeJson(e.message) << "\""
            << "}";
        if (i + 1 < errors.size()) out << ",";
    }
    out << "]";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        cerr << "{\"error\":\"Usage: analyzer <source-file-path>\"}" << endl;
        return 1;
    }

    string sourceCode;
    if (!readFile(argv[1], sourceCode)) {
        cerr << "{\"error\":\"Could not open source file: " << argv[1] << "\"}" << endl;
        return 1;
    }

    Lexer lexer(sourceCode);
    vector<Token> tokens = lexer.tokenize();
    vector<SymbolEntry> symbolTable = lexer.buildSymbolTable();
    const vector<LexError>& errors = lexer.getErrors();

    // ---- print the single combined JSON object ----
    cout << "{";
    printTokensJson(cout, tokens);
    cout << ",";
    printStatisticsJson(cout, tokens, lexer.getCommentCount(), (int)errors.size());
    cout << ",";
    printSymbolTableJson(cout, symbolTable);
    cout << ",";
    printErrorsJson(cout, errors);
    cout << "}" << endl;

    return 0;
}
