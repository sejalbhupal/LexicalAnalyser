// ============================================================
//  Lexer.cpp
//  ------------------------------------------------------------
//  Implementation of the extended Lexer used by the LexiScan
//  web backend. Still a hand-written character-by-character
//  scanner - no regex, no external libraries.
// ============================================================

#include "Lexer.h"
#include <cctype>
#include <sstream>

const std::set<std::string> Lexer::keywords = {
    "int", "float", "double", "char", "bool", "void", "long", "short",
    "unsigned", "signed", "const", "static", "auto", "extern", "register",
    "volatile", "if", "else", "switch", "case", "default", "while", "do",
    "for", "break", "continue", "return", "goto", "struct", "union",
    "enum", "typedef", "sizeof", "class", "public", "private", "protected",
    "new", "delete", "this", "namespace", "using", "template", "virtual",
    "friend", "try", "catch", "throw", "true", "false", "inline",
    "operator", "nullptr", "constexpr", "explicit", "mutable"
};

Lexer::Lexer(const std::string& sourceCode)
    : source(sourceCode), pos(0), line(1), commentCount(0) {}

char Lexer::currentChar() const {
    if (pos >= source.size()) return '\0';
    return source[pos];
}

char Lexer::peekChar(int offset) const {
    size_t p = pos + offset;
    if (p >= source.size()) return '\0';
    return source[p];
}

void Lexer::advance() {
    if (pos < source.size()) {
        if (source[pos] == '\n') line++;
        pos++;
    }
}

bool Lexer::isAtEnd() const {
    return pos >= source.size();
}

void Lexer::skipWhitespaceAndComments() {
    while (!isAtEnd()) {
        char c = currentChar();

        if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
            advance();
        }
        else if (c == '/' && peekChar() == '/') {
            commentCount++;
            while (!isAtEnd() && currentChar() != '\n') advance();
        }
        else if (c == '/' && peekChar() == '*') {
            commentCount++;
            int startLine = line;
            advance(); advance();
            bool closed = false;
            while (!isAtEnd()) {
                if (currentChar() == '*' && peekChar() == '/') {
                    advance(); advance();
                    closed = true;
                    break;
                }
                advance();
            }
            if (!closed) {
                errors.push_back({startLine, "Unterminated multi-line comment (missing */)"});
            }
        }
        else {
            break;
        }
    }
}

Token Lexer::makeInvalidToken(const std::string& lexeme) {
    errors.push_back({line, "Invalid token '" + lexeme + "'"});
    return Token{0, lexeme, TokenType::INVALID, line};
}

Token Lexer::scanIdentifierOrKeyword() {
    int startLine = line;
    std::string lexeme;
    while (!isAtEnd() && (isalnum((unsigned char)currentChar()) || currentChar() == '_')) {
        lexeme += currentChar();
        advance();
    }
    TokenType type = keywords.count(lexeme) ? TokenType::KEYWORD : TokenType::IDENTIFIER;
    return Token{0, lexeme, type, startLine};
}

Token Lexer::scanNumber() {
    int startLine = line;
    std::string lexeme;
    bool isFloat = false;
    bool malformed = false;

    while (!isAtEnd() && isdigit((unsigned char)currentChar())) {
        lexeme += currentChar();
        advance();
    }

    if (currentChar() == '.' && isdigit((unsigned char)peekChar())) {
        isFloat = true;
        lexeme += currentChar();
        advance();
        while (!isAtEnd() && isdigit((unsigned char)currentChar())) {
            lexeme += currentChar();
            advance();
        }
        if (currentChar() == '.') {
            malformed = true;
            while (!isAtEnd() && (isdigit((unsigned char)currentChar()) || currentChar() == '.')) {
                lexeme += currentChar();
                advance();
            }
        }
    }

    if (!isAtEnd() && (isalpha((unsigned char)currentChar()) || currentChar() == '_')) {
        malformed = true;
        while (!isAtEnd() && (isalnum((unsigned char)currentChar()) || currentChar() == '_')) {
            lexeme += currentChar();
            advance();
        }
    }

    if (malformed) return makeInvalidToken(lexeme);

    return Token{0, lexeme, isFloat ? TokenType::FLOAT_CONST : TokenType::INTEGER_CONST, startLine};
}

Token Lexer::scanStringLiteral() {
    int startLine = line;
    std::string lexeme;
    lexeme += currentChar();
    advance();

    bool closed = false;
    while (!isAtEnd()) {
        char c = currentChar();
        if (c == '\\' && peekChar() != '\0') {
            lexeme += c; advance();
            lexeme += currentChar(); advance();
            continue;
        }
        if (c == '"') { lexeme += c; advance(); closed = true; break; }
        if (c == '\n') break;
        lexeme += c;
        advance();
    }

    if (!closed) {
        errors.push_back({startLine, "Unterminated string literal " + lexeme});
        return Token{0, lexeme, TokenType::INVALID, startLine};
    }
    return Token{0, lexeme, TokenType::STRING_LITERAL, startLine};
}

Token Lexer::scanCharLiteral() {
    int startLine = line;
    std::string lexeme;
    lexeme += currentChar();
    advance();

    if (currentChar() == '\\' && peekChar() != '\0') {
        lexeme += currentChar(); advance();
        lexeme += currentChar(); advance();
    } else if (currentChar() != '\'' && currentChar() != '\0') {
        lexeme += currentChar(); advance();
    }

    if (currentChar() == '\'') {
        lexeme += currentChar();
        advance();
        return Token{0, lexeme, TokenType::CHAR_LITERAL, startLine};
    }

    errors.push_back({startLine, "Unterminated character literal " + lexeme});
    return Token{0, lexeme, TokenType::INVALID, startLine};
}

// A preprocessor directive is taken as everything from '#' to the
// end of the physical line (e.g. "#include <iostream>", "#define N 10").
Token Lexer::scanPreprocessorDirective() {
    int startLine = line;
    std::string lexeme;
    while (!isAtEnd() && currentChar() != '\n') {
        lexeme += currentChar();
        advance();
    }
    return Token{0, lexeme, TokenType::PREPROCESSOR, startLine};
}

Token Lexer::scanOperatorOrDelimiter() {
    int startLine = line;
    char c = currentChar();
    char n = peekChar();
    char n2 = peekChar(2);

    // ---- three-character operators: <<=  >>= ----
    std::string three;
    three += c; three += n; three += n2;
    if (three == "<<=" || three == ">>=") {
        advance(); advance(); advance();
        return Token{0, three, TokenType::ASSIGNMENT_OP, startLine};
    }

    // ---- two-character operators ----
    std::string two;
    two += c; two += n;

    static const std::set<std::string> relationalTwo = {"==", "!=", "<=", ">="};
    static const std::set<std::string> logicalTwo     = {"&&", "||"};
    static const std::set<std::string> assignTwo      = {"+=", "-=", "*=", "/=", "%=", "&=", "|=", "^="};
    static const std::set<std::string> incDecTwo      = {"++", "--"};
    static const std::set<std::string> bitwiseTwo      = {"<<", ">>"};

    if (relationalTwo.count(two)) { advance(); advance(); return Token{0, two, TokenType::RELATIONAL_OP, startLine}; }
    if (logicalTwo.count(two))     { advance(); advance(); return Token{0, two, TokenType::LOGICAL_OP, startLine}; }
    if (assignTwo.count(two))      { advance(); advance(); return Token{0, two, TokenType::ASSIGNMENT_OP, startLine}; }
    if (incDecTwo.count(two))      { advance(); advance(); return Token{0, two, TokenType::INC_DEC_OP, startLine}; }
    if (bitwiseTwo.count(two))     { advance(); advance(); return Token{0, two, TokenType::BITWISE_OP, startLine}; }

    // ---- single-character operators / delimiters ----
    std::string one(1, c);

    switch (c) {
        case '+': case '-': case '*': case '/': case '%':
            advance();
            return Token{0, one, TokenType::ARITHMETIC_OP, startLine};

        case '<': case '>':
            advance();
            return Token{0, one, TokenType::RELATIONAL_OP, startLine};

        case '=':
            advance();
            return Token{0, one, TokenType::ASSIGNMENT_OP, startLine};

        case '!':
            advance();
            return Token{0, one, TokenType::LOGICAL_OP, startLine};

        case '&': case '|': case '^': case '~':
            advance();
            return Token{0, one, TokenType::BITWISE_OP, startLine};

        case '(': case ')': case '{': case '}':
        case '[': case ']': case ',': case ';': case '.': case ':':
            advance();
            return Token{0, one, TokenType::DELIMITER, startLine};

        default:
            advance();
            return makeInvalidToken(one);
    }
}

std::vector<Token> Lexer::tokenize() {
    int nextId = 1;
    while (true) {
        skipWhitespaceAndComments();
        if (isAtEnd()) break;

        char c = currentChar();
        Token tok;

        if (isalpha((unsigned char)c) || c == '_') {
            tok = scanIdentifierOrKeyword();
        }
        else if (isdigit((unsigned char)c)) {
            tok = scanNumber();
        }
        else if (c == '"') {
            tok = scanStringLiteral();
        }
        else if (c == '\'') {
            tok = scanCharLiteral();
        }
        else if (c == '#') {
            tok = scanPreprocessorDirective();
        }
        else {
            tok = scanOperatorOrDelimiter();
        }

        tok.id = nextId++;
        tokens.push_back(tok);
    }
    return tokens;
}

const std::vector<LexError>& Lexer::getErrors() const {
    return errors;
}

int Lexer::getCommentCount() const {
    return commentCount;
}

std::vector<SymbolEntry> Lexer::buildSymbolTable() const {
    std::vector<SymbolEntry> table;
    std::map<std::string, size_t> indexOf; // name -> position in 'table'

    for (const auto& tok : tokens) {
        if (tok.type != TokenType::IDENTIFIER) continue;

        auto it = indexOf.find(tok.lexeme);
        if (it == indexOf.end()) {
            indexOf[tok.lexeme] = table.size();
            table.push_back(SymbolEntry{(int)table.size() + 1, tok.lexeme, tok.line, 1});
        } else {
            table[it->second].occurrences++;
        }
    }
    return table;
}
