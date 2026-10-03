#pragma once

typedef struct Symbol{
	char* name;
	int address;
} Symbol;

typedef struct SymbolTable{
	struct Symbol* data;
	int size;
	int capacity;
} SymbolTable;

