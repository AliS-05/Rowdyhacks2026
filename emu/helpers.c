#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include "helpers.h"

static char *json_operands[MAX_OPERANDS];
static uint32_t json_register_states[NUM_REGS];

static uint32_t json_memory_locations[MAX_MEMORY_DIFFS];
static uint8_t json_memory_values[MAX_MEMORY_DIFFS];
static uint8_t json_memory_old_values[MAX_MEMORY_DIFFS];

void initCurrentJSONInstruction(void){
	CurrentJSONInstruction.operands = json_operands;
	CurrentJSONInstruction.registerStates = json_register_states;

	CurrentJSONInstruction.memoryLocationsDiffed = json_memory_locations;
	CurrentJSONInstruction.memoryValuesDiffed = json_memory_values;
	CurrentJSONInstruction.memory_old_value = json_memory_old_values;
}

void resetCurrentJSONInstruction(int cycle){
	CurrentJSONInstruction.cycle_number = cycle;
	CurrentJSONInstruction.program_counter = pc;

	CurrentJSONInstruction.instruction_mnemonic = NULL;
	CurrentJSONInstruction.opcode = 0;

	CurrentJSONInstruction.operand_count = 0;
	CurrentJSONInstruction.memory_diff_count = 0;

	for (int i = 0; i < MAX_OPERANDS; i++)
		CurrentJSONInstruction.operands[i] = NULL;

	for (int i = 0; i < NUM_REGS; i++)
		CurrentJSONInstruction.registerStates[i] = r[i];
}

void recordInstruction(const char *mnemonic, uint32_t opcode, const char *op1, const char *op2, const char *op3) {
	CurrentJSONInstruction.instruction_mnemonic = (char *)mnemonic;
	CurrentJSONInstruction.opcode = opcode;

	if (op1)
		CurrentJSONInstruction.operands[
			CurrentJSONInstruction.operand_count++
		] = (char *)op1;

	if (op2)
		CurrentJSONInstruction.operands[
			CurrentJSONInstruction.operand_count++
		] = (char *)op2;

	if (op3)
		CurrentJSONInstruction.operands[
			CurrentJSONInstruction.operand_count++
		] = (char *)op3;
}

const char* returnRegisterString(uint8_t reg) {
	switch (reg) {
		case 1:  return "r1";
		case 2:  return "r2";
		case 3:  return "r3";
		case 4:  return "r4";
		case 5:  return "r5";
		case 6:  return "r6";
		case 7:  return "r7";
		case 8:  return "r8";
		case 9:  return "r9";
		case 10: return "r10";
		case 11: return "r11";
		case 12: return "r12";
		case 13: return "r13";
		case 14: return "r14";
		case 15: return "r15";
		case 16: return "r16";
		default: return "invalid";
	}
}

