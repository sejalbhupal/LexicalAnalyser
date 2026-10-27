// ============================================================
//  Lexer.h
//  ------------------------------------------------------------
//  Declares the Lexer class used by the LexiScan web backend.
//  Same "hand-written scanner" design as a classic Compiler
//  Construction mini project, extended with:
//    - bitwise operators (& | ^ ~ << >>)
//    - preprocessor directive detection (#include, #define, ...)
//    - comment counting (for statistics, comments aren't tokens)
//    - a symbol table of unique identifiers
//    - structured errors (line + message) instead of plain strings
// ============================================================

#ifndef LEXER_H
#define LEXER_H

#include <string>
#include <vector>
#include <set>
#include <map>
#include "Token.h"

class Lexer {
private:
    std::string source;
    size_t pos;
    int line;

    std::vector<Token> tokens;
    std::vector<LexError> errors;
    int commentCount;

    static const std::set<std::string> keywords;

    // ---- low level character helpers ----
    char currentChar() const;
    char peekChar(int offset = 1) const;
    void advance();
    bool isAtEnd() const;

    void skipWhitespaceAndComments();

    // ---- token scanners ----
    Token scanIdentifierOrKeyword();
    Token scanNumber();
    Token scanStringLiteral();
    Token scanCharLiteral();
    Token scanPreprocessorDirective();
    Token scanOperatorOrDelimiter();

    Token makeInvalidToken(const std::string& lexeme);

public:
    explicit Lexer(const std::string& sourceCode);

    std::vector<Token> tokenize();

    const std::vector<LexError>& getErrors() const;
    int getCommentCount() const;

    // Builds the symbol table (unique identifiers only, keywords excluded)
    // from the already-produced token list. Call after tokenize().
    std::vector<SymbolEntry> buildSymbolTable() const;
};

#endif // LEXER_H
