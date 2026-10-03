#include <stdint.h>
#include <memory.h>
#include <token.h>
#include <parser.h>
#include <vector.h>
#include <stdbool.h>
#include <helpers.h>
#include <stdio.h>
extern long line;
extern long currentAddress;

//int instructionSize(Instruction* i){
//	if(!i) return 0;
//	switch(i->mnemonic){
//		case INST_INVALID:
//			return 0;
//		case INST_MOV:
//			//B8 00 00 00 00 (little endian immediate)
//			// mov reg, imm
//			if(i->operand1.type == REGISTER && i->operand2.type == NUMBER){
//				i->size = 5;
//				return 5;
//			//mov reg, reg
//			} else if (i->operand1.type == REGISTER && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			} else if(i->operand1.type == MEMORY){
//				if(i->operand2.type == NUMBER){
//					//C7 case, opcode + modrm + imm
//					i->size = 6;
//					return 6;
//				}
//				//REGISTER
//				else{
//					//8B opcode, mov [reg], reg
//					i->size = 2;
//					return 2;
//				}
//			} else if(i->operand2.type == MEMORY){
//				//8B opcode, mov ebx, [eax]
//				i->size = 2;
//				return 2;
//			}
//			break;
//		case INST_LABEL:
//			return 0;
//			break;
//		// C3
//		case INST_RET:
//			i->size = 1;
//			return 1;
//		// E9 + 32 bit imm
//		case INST_JMP:
//			i->size = 5;
//			return 5; //near jump for now
//
//		case INST_ADD:
//			if(i->operand1.type == MEMORY && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			} else if(i->operand1.type == MEMORY && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			} else if(i->operand1.type == REGISTER && i->operand2.type == MEMORY){
//				i->size = 2;
//				return 2;
//			}else if(i->operand1.type == REGISTER && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			}else if(i->operand1.type == REGISTER && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			}
//		case INST_SUB:
//			if(i->operand1.type == MEMORY && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			} else if(i->operand1.type == MEMORY && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			} else if(i->operand1.type == REGISTER && i->operand2.type == MEMORY){
//				i->size = 2;
//				return 2;
//			}else if(i->operand1.type == REGISTER && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			}else if(i->operand1.type == REGISTER && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			}
//		case INST_CMP:
//			if(i->operand1.type == MEMORY && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			} else if(i->operand1.type == REGISTER && i->operand2.type == REGISTER){
//				i->size = 2;
//				return 2;
//			} else if(i->operand1.type == REGISTER && i->operand2.type == MEMORY){
//				i->size = 2;
//				return 2;
//			}else if(i->operand1.type == REGISTER && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			}else if(i->operand1.type == MEMORY && i->operand2.type == NUMBER){
//				i->size = 6;
//				return 6;
//			}
//			break;
//		case INST_CALL:
//			i->size = 5;
//			return 5;
//		case INST_JE:
//			i->size = 6;
//			return 6;
//		case INST_PUSH:
//		case INST_POP:
//			i->size = 1;
//			return 1;
//		case INST_JNE:
//			i->size = 6;
//			return 6;
//		default:
//		case INST_NOP:
//			i->size = 1;
//			return 1;
//
//			printf("Error calculating iruction size\n");
//			return -1;		
//	}
//	return -1;
//}


MnemonicType strToInstructionType(const char* str) {
	if (!strcmp(str, "lw"))   return INST_LW;
	if (!strcmp(str, "sw"))   return INST_SW;
	if (!strcmp(str, "addi")) return INST_ADDI;
	if (!strcmp(str, "add"))  return INST_ADD;
	if (!strcmp(str, "sub"))  return INST_SUB;
	if (!strcmp(str, "bne"))  return INST_BNE;

	if (!strcmp(str, "mov"))  return INST_MOV;
	if (!strcmp(str, "jmp"))  return INST_JMP;
	if (!strcmp(str, "call")) return INST_CALL;
	if (!strcmp(str, "ret"))  return INST_RET;
	if (!strcmp(str, "push")) return INST_PUSH;
	if (!strcmp(str, "pop"))  return INST_POP;
	if (!strcmp(str, "cmp"))  return INST_CMP;
	if (!strcmp(str, "je"))   return INST_JE;
	if (!strcmp(str, "jne"))  return INST_JNE;
	if (!strcmp(str, "nop"))  return INST_NOP;

	return INST_INVALID;
}


const char* mnemonicTypeToStr(MnemonicType type){
	switch(type){
		case INST_LW: return "lw";
		case INST_SW: return "sw";
		case INST_ADDI: return "addi";
		case INST_ADD: return "add";
		case INST_SUB: return "sub";
		case INST_BNE: return "bne";

		case INST_LABEL: return "label";
		case INST_MOV:  return "mov";
		case INST_JMP:  return "jmp";
		case INST_CALL: return "call";
		case INST_RET:  return "ret";
		case INST_PUSH: return "push";
		case INST_POP:  return "pop";
		case INST_CMP:  return "cmp";
		case INST_JE:   return "je";
		case INST_JNE:  return "jne";
		case INST_NOP:  return "nop";
		default:        return "invalid";
	    }
}


void printInstruction(Instruction* i){
	if(!i) return;
	char buf[32];
	printf("Instruction{ ");
	printf(mnemonicTypeToStr(i->mnemonic));
	printf(" }\n");
	if(i->operandCount >= 1){
		if(i->operand1.type == NUMBER){
			printf(" Operand 1 { ");
			printf("%s", ntos(i->operand1.intValue, buf, 10));
			printf(buf);
			printf(" }\n");
		} else{
			printf(" Operand 1 { ");
			printf(i->operand1.strValue);
			printf(" }\n");
		}
	}

	if(i->operandCount >= 2){
		if(i->operand2.type == NUMBER){
			printf(" Operand 2 { ");
			printf("%s", ntos(i->operand2.intValue, buf, 10));
			
			printf(" }\n");
		} else{
			printf(" Operand 2 { ");
			printf(i->operand2.strValue);
			printf(" }\n");
		}
	}
	if(i->operandCount >= 3){
		if(i->operand3.type == NUMBER){
			printf(" Operand 3 { ");
			printf("%s", ntos(i->operand3.intValue, buf, 10));
			
			printf(" }\n");
		} else{
			printf(" Operand 3 { ");
			printf(i->operand3.strValue);
			printf(" }\n");
		}
	}
	printf("Size of Instruction: ");
	printf("%s", ntos(i->size, buf , 10));
	printf("\n");
	printf("Address of Instruction: ");
	printf("%s", ntos(i->address, buf , 10));
	printf("\n");
}

Token advance(Token* tokenArray, int* index){
	(*index)++;
	return tokenArray[*index];

}

Token advanceTokVector(TokVector* vec, int* position){
	return vec->data[++(*position)];
}

Token peek(Token* t, int index){
	return t[index+1];
}

//simple check, if the two types dont match printf an error. I dont have exit(1) implemented unfortunately so i think errors will just not really matter
void expect(Token* tokenArray, int* index, TokenType expectedType){
	if(tokenArray[*index].type != expectedType){
		printf("Error on line: ");
		char buf[32];
		printf("%s", ntos(line, buf, 10));
		printf("Expected: ");
		printf((tokenTypeToString(expectedType)));
		printf("Got: ");	
		printf(tokenTypeToString(tokenArray[*index].type));
		printf("\n");
		return;
	}
	(*index)++;
}

Operand parseOperand(TokVector* vec, int* pos){
	Operand op;
	Token t = vec->data[*pos]; //t is current Token
	op.type = t.type;
	op.line = t.line;
	
	if(t.type == LBRACKET){
		(*pos)++; //skip [
		op.type = MEMORY; // dont want it to stay LBRACKET
		op.strValue = vec->data[*pos].strValue; //copying register value
		(*pos)++; //done with register now sitting at ] which gets skipped below
	}
	else if(t.type == NUMBER){
		op.intValue = t.intValue;
	} else{
		op.strValue = t.strValue;
	}
	(*pos)++;
	return op;
}

Instruction parseInstruction(TokVector* vec){
	char buf[32];
	// basically only looking for important stuff
	// mnemonics, register, immediates
	int instructionPos = 0;
	Instruction instruction = {0};
	instruction.mnemonic = INST_INVALID;
	instruction.operandCount = 0;
	// NOTE need to add error handling but leave that for later
	// this should always be a mnemonic such as mov or jmp
	
	if(vec->size == 0){
		return instruction;
	}
	//i have no idea what this is rereading it
	//sayinhg if there are 2 tokens and the first oh its skipping start: i think
	if(vec->size == 2 && vec->data[0].type == IDENTIFIER && vec->data[1].type == COLON){
		instruction.mnemonic = INST_LABEL;
		instruction.labelName = vec->data[0].strValue;
		printf("LABEL: ");
		printf(vec->data[0].strValue); 
		printf("Address: ");
		printf("%s", ntos(currentAddress, buf, 10));

		return instruction; // skip adding to instruction vector
	}
	//directives
	if(vec->data[0].type == IDENTIFIER && ((!strcmp(vec->data[0].strValue, "global")) ||(!strcmp(vec->data[0].strValue, "section")))){
		return instruction; //another skip not an instruction
	}
	
	if(vec->data[0].type != IDENTIFIER){ //error not a label directive or mnemonic
		printf("Error on line: ");
		printf("%s", ntos(vec->data[0].line, buf, 10));
		printf("Expected mnemonic, got: ");
		printf(tokenTypeToString(vec->data[0].type));
		return instruction;
	}

	instructionPos++;
	instruction.mnemonic = strToInstructionType(vec->data[0].strValue);
	// verifying there are more tokens and getting next operand
	if(instructionPos < vec->size){
		instruction.operand1 = parseOperand(vec, &instructionPos);
		instruction.operandCount = 1;
	}
	
	//skipping commma 
	if(instructionPos < vec->size && vec->data[instructionPos].type == COMMA){
		instructionPos++;
	}
	
	// verify second token and get second operand
	if(instructionPos < vec->size){
		instruction.operand2 = parseOperand(vec, &instructionPos);
		instruction.operandCount = 2;
	}

	//skipping commma 
	if(instructionPos < vec->size && vec->data[instructionPos].type == COMMA){
		instructionPos++;
	}

	// verify third token and get third operand
	if(instructionPos < vec->size){
		instruction.operand3 = parseOperand(vec, &instructionPos);
		instruction.operandCount = 3;
	}

	return instruction;
}

void parseLine(Token* tokenArray, int* index, InstructionVector* instVec){
	TokVector tokVec;
	tokenVecInit(&tokVec);
	bool modrmNeeded = false;

	while(tokenArray[*index].type != NEWLINE &&
	      tokenArray[*index].type != TOK_EOF){

		tokenVecPush(&tokVec, tokenArray[*index]);
		(*index)++;
	}
	// vector should contain something like {MOV EAX COMMA 5 SEMICOLON NEWLINE}
	// or is empty
	
	
	

	if(tokVec.size > 0) {
		Instruction inst = parseInstruction(&tokVec);
		if(inst.mnemonic != INST_INVALID){
			inst.address = currentAddress;
			currentAddress += 4 /*instructionSize(&inst)*/;
			instVecPush(instVec, inst);
			printInstruction(&inst);
		}
	}
	if(tokenArray[*index].type == NEWLINE)
		(*index)++;

	tokenVecFree(&tokVec);
}

void parseTokenArray(Token* tokenArray, InstructionVector* instVec){
	int index = 0;
	while(tokenArray[index].type != TOK_EOF){
		parseLine(tokenArray, &index, instVec);	
	}

}
