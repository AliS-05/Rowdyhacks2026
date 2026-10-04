#include <stdint.h>
#include <stdlib.h>
#include <codegen.h>
#include <parser.h>
#include <stdio.h>
#include <symbol_table.h>
#include <string.h>

void ByteVectorInit(ByteVector* vec){
	vec->size = 0;
	vec->capacity = 16;
	vec->data = malloc(sizeof(uint8_t) * vec->capacity);
}

void ByteVectorPush(ByteVector* vec, uint8_t byte){
	if(vec->size >= vec->capacity){
		vec->capacity *= 2;
		vec->data = realloc(vec->data, sizeof(uint8_t) * vec->capacity);
	}
	vec->data[vec->size++] = byte;
}

void ByteVectorFree(ByteVector* vec){
	free(vec->data);
}

void ByteVectorWrite32(ByteVector* vec, int value) {
	ByteVectorPush(vec, value & 0xFF);
	ByteVectorPush(vec, (value >> 8) & 0xFF);
	ByteVectorPush(vec, (value >> 16) & 0xFF);
	ByteVectorPush(vec, (value >> 24) & 0xFF);
}

int getRegisterCode(const char* reg) {
	if(!strcmp(reg, "r1"))  return 1;
	if(!strcmp(reg, "r2"))  return 2;
	if(!strcmp(reg, "r3"))  return 3;
	if(!strcmp(reg, "r4"))  return 4;
	if(!strcmp(reg, "r5"))  return 5;
	if(!strcmp(reg, "r6"))  return 6;
	if(!strcmp(reg, "r7"))  return 7;
	if(!strcmp(reg, "r8"))  return 8;
	if(!strcmp(reg, "r9"))  return 9;
	if(!strcmp(reg, "r10")) return 10;
	if(!strcmp(reg, "r11")) return 11;
	if(!strcmp(reg, "r12")) return 12;

	printf("Unknown register: %s\n", reg);
	return -1;
}


//http://ref.x86asm.net/coder32.html
//such a goated website
void encodeInstruction(Instruction* inst, SymbolTable* table, ByteVector* byteVector){
	//NOTE commenting this out but might want later
//	print("DEBUG encode Instruction mnemonic value: ");
//	print(inst->mnemonic);
//	print("\n");
	switch(inst->mnemonic) {
		case INST_LABEL: {
			 break;
		}
		case INST_LW:{
			int register1 = getRegisterCode(inst->operand1.strValue);
			int register2;
			uint32_t funct7 = 0b0000000;
			if(inst->operand2.type == EXPRESSION){
				register2 = getRegisterCode(inst->operand2.strValue);
				funct7 = inst->operand2.offset;
			}else{
				register2 = getRegisterCode(inst->operand2.strValue);
			}

			//int operand3 = inst->operand3.intValue;
			int rd = getRegisterCode(inst->operand1.strValue);
			int rs1 = getRegisterCode(inst->operand2.strValue);
			int immediate = inst->operand2.offset;

			uint32_t instruction = 0;

			instruction |= 0x03;
			instruction |= rd << 7;
			instruction |= 0b010 << 12;
			instruction |= rs1 << 15;
			instruction |= (immediate & 0xFFF) << 20;

			ByteVectorWrite32(byteVector, instruction);
			break;

	      	}
		case INST_SW: {
			int register1 = getRegisterCode(inst->operand1.strValue);
			int register2;
			uint32_t funct7 = 0b0000000;
			if(inst->operand2.type == EXPRESSION){
				register2 = getRegisterCode(inst->operand2.strValue);
				funct7 = inst->operand2.offset;
			}else{
				register2 = getRegisterCode(inst->operand2.strValue);
			}
			//int operand3 = inst->operand3.intValue;
			
			int rs2 = getRegisterCode(inst->operand1.strValue);
			int rs1 = getRegisterCode(inst->operand2.strValue);
			int immediate = inst->operand2.offset;

			uint32_t instruction = 0;

			instruction |= 0x23;
			instruction |= (immediate & 0x1F) << 7;
			instruction |= 0b010 << 12;
			instruction |= rs1 << 15;
			instruction |= rs2 << 20;
			instruction |= ((immediate >> 5) & 0x7F) << 25;

			ByteVectorWrite32(byteVector, instruction);
			break;
		}
		case INST_ADDI: {
			int register1, register2, immediate;
			if(inst->operand1.type == NUMBER){
				register1 = inst->operand1.intValue;
			}else{
				register1 = getRegisterCode(inst->operand1.strValue);
			}
			if(inst->operand2.type == NUMBER){
				register2 = inst->operand2.intValue;
			}else{
				register2 = getRegisterCode(inst->operand2.strValue);
			}
			if(inst->operand3.type == NUMBER){
				immediate = inst->operand3.intValue;
			}else{
				immediate = getRegisterCode(inst->operand3.strValue);
			}

			uint32_t instruction = 0;
			uint32_t opcode = 0b0010011;
			instruction |= immediate << 20;
			instruction |= register2 << 15;
			instruction |= 0b000 << 12;
			instruction |= register1 << 7;
			instruction |= opcode;
			ByteVectorWrite32(byteVector, instruction);
			break;
		}

		case INST_BNE: {
			int register1, register2, immediate;
			if(inst->operand1.type == NUMBER){
			register1 = inst->operand1.intValue;
			}else{
			register1 = getRegisterCode(inst->operand1.strValue);
			}

			if(inst->operand2.type == NUMBER){
			register2 = inst->operand2.intValue;
			}else{
			register2 = getRegisterCode(inst->operand2.strValue);
			}
			if(inst->operand3.type == NUMBER){
			immediate = inst->operand3.intValue;
			}else{
			immediate = getRegisterCode(inst->operand3.strValue);
			}

			uint32_t instruction = 0;
			uint32_t opcode = 0b1100011;

			instruction |= opcode;
			instruction |= 0b001 << 12;
			instruction |= register1 << 15;
			instruction |= register2 << 20;
			instruction |= ((immediate >> 12) & 0x1) << 31;
			instruction |= ((immediate >> 5) & 0x3F) << 25;
			instruction |= ((immediate >> 1) & 0xF) << 8;
			instruction |= ((immediate >> 11) & 0x1) << 7;
			ByteVectorWrite32(byteVector, instruction);
			break;
			}


		case INST_MOV: {
			//encodeMove(inst, byteVector);
			break;
		}
		case INST_RET: {
			ByteVectorPush(byteVector, 0xC3);
			break;
		}
		case INST_JMP: {
			ByteVectorPush(byteVector, 0xE9);
			//formula for jmp = target - (currentAddress + 5) (opcode + 4 byte address)
			// so if start is at 0 and jmp is at byte 7
			// 0 - (12) == -12 bytes to get to start label (since we have to add jmp's bytes as well)
			// negatives are automatically calculated and stored as twos complement ! so no need to implement functions for that
			int laddr = symbolTableLookup(table, inst->operand1.strValue);
			ByteVectorWrite32(byteVector, (laddr - (inst->address + 5)));
			break;
		}

		case INST_ADD: {
			int register1, register2, register3;
			if(inst->operand1.type == NUMBER){
				register1 = inst->operand1.intValue;
			}else{
				register1 = getRegisterCode(inst->operand1.strValue);
			}
			if(inst->operand2.type == NUMBER){
				register2 = inst->operand2.intValue;
			}else{
				register2 = getRegisterCode(inst->operand2.strValue);
			}
			if(inst->operand3.type == NUMBER){
				register3 = inst->operand3.intValue;
			}else{
				register3 = getRegisterCode(inst->operand3.strValue);
			}
			
			uint32_t instruction = 0;

			uint32_t opcode = 0b0110011;

			instruction |= opcode;

			instruction |= (0b000 << 12);
			instruction |= (register1 << 7);
			instruction |= (register2 << 15);
			instruction |= (register3 << 20);
			instruction |= (0b0000000 << 25);

			ByteVectorWrite32(byteVector, instruction);
			
			break;
	}
		case INST_SUB:{
			
			int register1, register2, register3;

			if(inst->operand1.type == NUMBER){
				register1 = inst->operand1.intValue;
			}else{
				register1 = getRegisterCode(inst->operand1.strValue);
			}
			if(inst->operand2.type == NUMBER){
				register2 = inst->operand2.intValue;
			}else{
				register2 = getRegisterCode(inst->operand2.strValue);
			}
			if(inst->operand3.type == NUMBER){
				register3 = inst->operand3.intValue;
			}else{
				register3 = getRegisterCode(inst->operand3.strValue);
			}

			uint32_t instruction = 0;
			uint32_t opcode = 0b0110011;

			instruction |= opcode;
			instruction |= (register1 << 7);
			instruction |= (0b000 << 12);
			instruction |= (register2 << 15);
			instruction |= (register3 << 20);
			instruction |= (0b0100000 << 25);
			ByteVectorWrite32(byteVector, instruction);
			break;
		}
		
		case INST_CALL: {
			ByteVectorPush(byteVector, 0xE8);
			int laddr = symbolTableLookup(table, inst->operand1.strValue);
			int rel = laddr - (inst->address + 5);
			ByteVectorWrite32(byteVector, rel);
			break;
		}
		case INST_JE: {
			ByteVectorPush(byteVector, 0x0F);
			ByteVectorPush(byteVector, 0x84);
			int laddr = symbolTableLookup(table, inst->operand1.strValue);
			int rel = laddr - (inst->address + 6);
			ByteVectorWrite32(byteVector, rel);
			break;
		}
		case INST_PUSH: {
			if(inst->operand1.type == REGISTER){
				int reg = getRegisterCode(inst->operand1.strValue);
				ByteVectorPush(byteVector, 0x50 + reg);
			}
			break;
		}
		case INST_POP: {
			if(inst->operand1.type == REGISTER){
				int reg = getRegisterCode(inst->operand1.strValue);
				ByteVectorPush(byteVector, 0x58 + reg);
			}
			break;
		}
		case INST_JNE: {
			ByteVectorPush(byteVector, 0x0F);
			ByteVectorPush(byteVector, 0x85);
			int laddr = symbolTableLookup(table, inst->operand1.strValue);
			int rel = laddr - (inst->address + 6);
			ByteVectorWrite32(byteVector, rel);
			break;
		}
		case INST_NOP: {
			ByteVectorPush(byteVector, 0x90);
			break;
		}
		default: {
			printf("Error encoding instruction from codegen.c\n");
			return;
			break;
		}
	}
}

//loop through instruction vector, translate instruction based on mnemonic register / immediate etc, look up labels in symbolTable,  emit code byte, 
void startCodeGen(InstructionVector* instVec, SymbolTable* table, ByteVector* byteVector){
	for(int i = 0; i < instVec->size; i++){
		encodeInstruction(&instVec->data[i], table, byteVector);
	}
}
