// ============================================================
//  Token.cpp
//  ------------------------------------------------------------
//  Implementation of small shared helpers: converting a
//  TokenType to a display string, and escaping raw text so it
//  is safe to embed inside a JSON string.
// ============================================================

#include "Token.h"
#include <sstream>
#include <iomanip>

std::string tokenTypeToString(TokenType type) {
    switch (type) {
        case TokenType::KEYWORD:        return "Keyword";
        case TokenType::IDENTIFIER:     return "Identifier";
        case TokenType::INTEGER_CONST:  return "Integer Constant";
        case TokenType::FLOAT_CONST:    return "Float Constant";
        case TokenType::STRING_LITERAL: return "String Literal";
        case TokenType::CHAR_LITERAL:   return "Character Literal";
        case TokenType::ARITHMETIC_OP:  return "Arithmetic Operator";
        case TokenType::RELATIONAL_OP:  return "Relational Operator";
        case TokenType::LOGICAL_OP:     return "Logical Operator";
        case TokenType::ASSIGNMENT_OP:  return "Assignment Operator";
        case TokenType::BITWISE_OP:     return "Bitwise Operator";
        case TokenType::INC_DEC_OP:     return "Increment/Decrement Operator";
        case TokenType::DELIMITER:      return "Delimiter";
        case TokenType::PREPROCESSOR:   return "Preprocessor Directive";
        case TokenType::INVALID:        return "Invalid Token";
        default:                        return "Unknown";
    }
}

std::string escapeJson(const std::string& raw) {
    std::ostringstream out;
    for (unsigned char c : raw) {
        switch (c) {
            case '"':  out << "\\\""; break;
            case '\\': out << "\\\\"; break;
            case '\b': out << "\\b";  break;
            case '\f': out << "\\f";  break;
            case '\n': out << "\\n";  break;
            case '\r': out << "\\r";  break;
            case '\t': out << "\\t";  break;
            default:
                if (c < 0x20) {
                    // any other control character -> \u00XX escape
                    out << "\\u" << std::hex << std::setw(4) << std::setfill('0') << (int)c << std::dec;
                } else {
                    out << c;
                }
        }
    }
    return out.str();
}
