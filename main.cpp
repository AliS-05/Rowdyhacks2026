#include <stdio.h>
#include "instructions.h"
#include "tokens.h"

char* source = NULL; 	
int currentTokenIndex = 0;
int curPos = 0;
int line = 1;
int currentAddress = 0x200000;

void assemble_buffer(char* buffer){
	source = buffer;
	Token tok;
	//hardcode 2048 token limit, should be fine for this scope
	Token* tokenArray = (Token*)malloc(sizeof(Token) * 2048);   
	InstructionVector instVec;
	instVecInit(&instVec);

	int totalTokens = 0;
	//start lexing
	printf("Starting Lexing\n");
	do{
		tok = nextToken();
		tokenArray[totalTokens] = tok;
		totalTokens++;

	} while(tok.type != TOK_EOF && totalTokens < 2048);
	
	line = 1;
	currentTokenIndex = 0;
	printf("Starting parsing phase..\n");
	parseTokenArray(tokenArray, &instVec);

	free(tokenArray);
	
	SymbolTable table;
	symbolTableInit(&table);
	
	printf("Constructing symbol table\n");
	// loop over instructionVector looking for INST_LABEL's and filling
	// in addresses
	for(int i = 0; i < instVec.size; i++){
		if(instVec.data[i].mnemonic == INST_LABEL){
			symbolTablePush(&table, instVec.data[i].labelName ,instVec.data[i].address);
		}
	}
	
	ByteVector byteVector;
	ByteVectorInit(&byteVector);
	
	printf("Constructing executable binary\n");
	startCodeGen(&instVec, &table, &byteVector);
	
	// write result to OS filesystem
	printf("Writing to output file\n");
	writeFile("asoutput", "exe", byteVector.data, byteVector.size);
	printf("Finished writing to output file. Enjoy!\n");
}



int main() {
	
	return 0;
}


