// ============================================================
//  Token.h
//  ------------------------------------------------------------
//  Data types shared by the whole lexical analyzer backend:
//    - TokenType   : every category of token we can recognize
//    - Token       : one scanned token (id, lexeme, type, line)
//    - LexError    : one lexical error (line + message)
//    - SymbolEntry : one row of the symbol table (unique identifiers)
//    - escapeJson()/tokenTypeToString() : small shared utilities
// ============================================================

#ifndef TOKEN_H
#define TOKEN_H

#include <string>

enum class TokenType {
    KEYWORD,
    IDENTIFIER,
    INTEGER_CONST,
    FLOAT_CONST,
    STRING_LITERAL,
    CHAR_LITERAL,
    ARITHMETIC_OP,
    RELATIONAL_OP,
    LOGICAL_OP,
    ASSIGNMENT_OP,
    BITWISE_OP,
    INC_DEC_OP,
    DELIMITER,
    PREPROCESSOR,
    INVALID
};

struct Token {
    int id;              // sequential token id, 1-based
    std::string lexeme;  // the raw text of the token
    TokenType type;       // its category
    int line;              // line number it was found on
};

struct LexError {
    int line;
    std::string message;
};

struct SymbolEntry {
    int id;
    std::string name;
    int firstLine;
    int occurrences;
};

// Human readable label for a TokenType (used in JSON "type" field).
std::string tokenTypeToString(TokenType type);

// Escapes a string so it can be safely embedded inside a JSON string
// literal ("..."). Handles quotes, backslashes, control characters.
std::string escapeJson(const std::string& raw);

#endif // TOKEN_H
