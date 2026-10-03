#pragma once

enum TokenType {
	TOK_EOF,
	NEWLINE,
	IDENTIFIER,
	REGISTER,
	NUMBER,
	COMMA,
	PLUS,
	MINUS,
	STAR,
	DIV,
	COLON,
	LBRACKET, // [
	RBRACKET, // ]
	MEMORY,
	INVALID

};


typedef struct {
	TokenType type;
	int line;
	union{
		char* strValue;
		long intValue;
	};
} Token;


const char* tokenTypeToString(TokenType type);
Token nextToken();
