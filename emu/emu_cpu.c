#include <stdio.h>
#include <string.h>
#include "emu.h"
#include "helpers.h"

extern uint8_t* memory;
uint32_t r[NUM_REGS] = {0};   // r[1] to r[16]; r[0] is unused
struct CurrentJSONInstruction CurrentJSONInstruction= {0};
int pc = 0;
//rd1

static void print_registers(void) {
	printf("   ");
	for (int i = 1; i <= 8; i++) printf(" r%d=%u", i, (unsigned)r[i]);
	printf("\n");
}

//void add(uint32_t* instruction) {
//	strcpy(CurrentJSONInstruction.instruction_mnemonic, "add");
//	uint32_t inst = *instruction;
//
//	uint8_t opcode =  inst        & 0x7F;
//	uint8_t rd     = (inst >> 7)  & 0x1F;
//	uint8_t funct3 = (inst >> 12) & 0x07;
//	uint8_t rs1    = (inst >> 15) & 0x1F;
//	uint8_t rs2    = (inst >> 20) & 0x1F;
//	uint8_t funct7 = (inst >> 25) & 0x7F;
//
//	char* operandsBuffer[10] = {0};
//	char* destRegStr = returnRegisterString(rd);
//	char* srcReg1Str = returnRegisterString(rs1);
//	char* srcReg2Str = returnRegisterString(rs2);
//	int idx = 0;
//	strncat(operandsBuffer + idx, destRegStr, strlen(destRegStr)); 
//	idx += strlen(destRegStr);
//	strncat(operandsBuffer + idx, srcReg1Str, strlen(srcReg1Str)); 
//	idx += strlen(destRegStr);
//	strncat(operandsBuffer + idx, srcReg2Str, strlen(srcReg2Str)); 
//
//	r[rd] = r[rs1] + r[rs2];
//}

void addi(uint32_t* instruction) {
	uint32_t inst = *instruction;

	uint8_t opcode =  inst        & 0x7F;
	uint8_t rd     = (inst >> 7)  & 0x1F;

	uint8_t funct3 = (inst >> 12) & 0x07;

	uint8_t rs1    = (inst >> 15) & 0x1F;

	uint8_t imm = (inst >> 25) & 0x7F;

	r[rd] = r[rs1] + imm;
}

void load(uint32_t* instruction) {
	//NOTE switch on funct3 if want lb, lh later
	int inst = *instruction;
	uint8_t opcode =  inst        & 0x7F;

	uint8_t rd     = (inst >> 7)  & 0x1F;
	uint8_t funct3 = (inst >> 12) & 0x07;
	uint8_t rs1    = (inst >> 15) & 0x1F;
	//uint8_t rs2    = (inst >> 20) & 0x1F;
	uint16_t imm = (inst >> 25) & 0x7F;
	
	uint32_t address = r[rs1] + imm;
	if(address > MEM_SIZE - 4){
		printf("ERROR: MEMORY OOB\n");
	}
	r[rd]= memory[address] | memory[address + 1] | memory[address + 2] | memory[address + 3];
	//uint32_t address = r[base] + (uint32_t)offset;
	//if (address > MEM_SIZE - 4) { printf("bad load at %u\n", (unsigned)address); return; }
	//r[destination] = (uint32_t)memory[address]              
	//	| (uint32_t)memory[address + 1] << 8
	//	| (uint32_t)memory[address + 2] << 16
	//	| (uint32_t)memory[address + 3] << 24;
}

void store(uint32_t* instruction) {
	//NOTE switch on funct3 if want lb, lh later
	int inst = *instruction;

	uint8_t opcode = inst & 0x7F;
	uint8_t immLow = (inst >> 7) & 0x1F;
	uint8_t funct3 = (inst >> 12) & 0x07;
	uint8_t rs1 = (inst >> 15) & 0x1F;
	uint8_t rs2 = (inst >> 20) & 0x1F;
	uint8_t immHigh = (inst >> 25) & 0x7F;

	uint16_t imm = (immHigh << 5) | immLow;

	uint32_t address = r[rs1] + imm;

	memory[address]     = r[rs2] & 0xFF;
	memory[address + 1] = (r[rs2] >> 8) & 0xFF;
	memory[address + 2] = (r[rs2] >> 16) & 0xFF;
	memory[address + 3] = (r[rs2] >> 24) & 0xFF;
}

void arithmetic(uint32_t* instruction){
	int inst = *instruction;
	uint8_t opcode =  inst        & 0x7F;

	uint8_t rd     = (inst >> 7)  & 0x1F;
	uint8_t funct3 = (inst >> 12) & 0x07;

	uint8_t rs1    = (inst >> 15) & 0x1F;
	uint8_t rs2    = (inst >> 20) & 0x1F;

	uint16_t funct7 = (inst >> 25) & 0x7F;

	switch(funct7){
		case 0b0: //add
			r[rd] = r[rs1] + r[rs2];
			break;
		case 0b0100000: //sub
			r[rd] = r[rs1] - r[rs2];
			break;
	}
}

// If the Main Loop auto incriments the PC, then the offset should be -1 to go back to the same instruction.
// If the Main Loop does not auto increment the PC, then the offset should be 0 to go to the next instruction.
void bne(uint32_t* instruction) {
	uint32_t inst = *instruction;

	uint8_t opcode = inst & 0x7F;
	uint8_t imm11 = (inst >> 7) & 0x01;
	uint8_t imm4_1 = (inst >> 8) & 0x0F;
	uint8_t funct3 = (inst >> 12) & 0x07;
	uint8_t rs1 = (inst >> 15) & 0x1F;
	uint8_t rs2 = (inst >> 20) & 0x1F;
	uint8_t imm10_5 = (inst >> 25) & 0x3F;
	uint8_t imm12 = (inst >> 31) & 0x01;

	int32_t imm = (imm12 << 12) | (imm11 << 11) | (imm10_5 << 5) | (imm4_1 << 1);

	// sign extend 13-bit immediate
	if (imm & 0x1000)
		imm |= ~0x1FFF;

	if (r[rs1] != r[rs2]) {
		pc += imm / 4;
	}
}


int execute_instruction(uint32_t* instruction) {
	uint32_t inst = *instruction;
	uint8_t opcode = inst & 0x7F;
	if (inst == 0x000000FF)
		return 1;
	printf("instruction = 0x%08x opcode = %u\n", inst, opcode);	
	switch (opcode) {
		case ADD: { // ADD rd, rs1, rs2
			arithmetic(instruction);
			break;
		}

		case ADDI: { // ADDI rd, rs1, immediate
			addi(instruction);
			break;
		}

		case LW: { // LW rd, offset(rs1)
			load(instruction);
			break;
		}

		case SW: { // SW rs2, offset(rs1)
			store(instruction);
			break;
		}

		case BNE: { // BNE rs1, rs2, offset
			bne(instruction);
			break;
		}

		case HALT:
			return 1;

		default:
			printf("Error: unknown opcode %d\n", opcode);
			return -1;
	}

	pc++;
	return 0;
}

int run_program(const unsigned char *program, int count, FILE* jsonOutput) {
	for (int cycle = 0; ; cycle++) {
		if (cycle >= MAX_STEPS) {                 
			printf("Error: stopped after %d steps (infinite loop?)\n", MAX_STEPS);
			return 1;
		}
		if (pc < 0 || pc >= count) { 
			printf("Error: pc=%d is outside the program (0..%d)\n", pc, count - 1);
			return 1;
		}
		CurrentJSONInstruction.cycle_number = cycle;
		CurrentJSONInstruction.program_counter = pc;

		//fprintf("{\ncycle_number : %d,\nprogram_counter : %d,\ninstruction_information : {\ninstruction : \"%s\", operands : [\"%s\",\"%s\",\"%s\"],\nopcode : \"%s\"\n},\n\"register_states\": [%d, %d, %d],\n\"memory_diff\" : []", steps, pc, );
		const uint8_t *p = &program[pc * 4];

		uint32_t instruction =
			(uint32_t)p[0]
			| ((uint32_t)p[1] << 8)
			| ((uint32_t)p[2] << 16)
			| ((uint32_t)p[3] << 24);

		int result = execute_instruction(&instruction);


		//json output
//		{
//			"cycle_number": 42,
//			"program_counter": 2097152,
//			"instruction_information": {
//				"instruction": "add",
//				"operands" : [r1, r2, r3],
//				"opcode": "00000000001100010000000010110011"
//			},
//			"register_states": [0,10,20,30],
//			"memory_locations_diffed": []
//			"memory_values_diffed" : []
//			"memory_old_value" : []
//		}

		if (result == -1) return 1;               /* error: stop safely */
		if (result == 1)  return 0;               /* stop */
	}
}
