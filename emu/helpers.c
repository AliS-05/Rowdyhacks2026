#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <stdint.h>
#include "helpers.h"
#include "emu.h"

extern struct CurrentJSONInstruction CurrentJSONInstruction;
extern int pc;
static char *json_operands[MAX_OPERANDS] = {0};
static uint32_t json_register_states[NUM_REGS] = {0};

static uint32_t json_memory_locations[MAX_MEMORY_DIFFS] = {0};
static uint8_t json_memory_values[MAX_MEMORY_DIFFS] = {0};
static uint8_t json_memory_old_values[MAX_MEMORY_DIFFS] = {0};

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

	//for (int i = 0; i < NUM_REGS; i++)
	//	CurrentJSONInstruction.registerStates[i] = r[i];
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

int writeJSONFile(FILE* jsonOutput) {
	if (jsonOutput == NULL)
		return -1;

	fprintf(jsonOutput, "{\n");

	fprintf(jsonOutput,
		"\t\"cycle_number\": %d,\n",
		CurrentJSONInstruction.cycle_number);

	fprintf(jsonOutput,
		"\t\"program_counter\": %d,\n",
		CurrentJSONInstruction.program_counter);

	fprintf(jsonOutput, "\t\"instruction_information\": {\n");

	fprintf(jsonOutput,
		"\t\t\"instruction\": \"%s\",\n",
		CurrentJSONInstruction.instruction_mnemonic);

	fprintf(jsonOutput,
		"\t\t\"opcode\": %u,\n",
		CurrentJSONInstruction.opcode);

	fprintf(jsonOutput, "\t\t\"operands\": [");

	for (int i = 0; i < CurrentJSONInstruction.operand_count; i++) {
		fprintf(jsonOutput, "\"%s\"",
			CurrentJSONInstruction.operands[i]);

		if (i < CurrentJSONInstruction.operand_count - 1)
			fprintf(jsonOutput, ", ");
	}

	fprintf(jsonOutput, "]\n");
	fprintf(jsonOutput, "\t},\n");


	/* registers */
	fprintf(jsonOutput, "\t\"register_states\": [");

	for (int i = 0; i < NUM_REGS; i++) {
		fprintf(jsonOutput, "%u",
			CurrentJSONInstruction.registerStates[i]);

		if (i < NUM_REGS - 1)
			fprintf(jsonOutput, ", ");
	}

	fprintf(jsonOutput, "],\n");


	/* memory locations changed */
	fprintf(jsonOutput, "\t\"memory_locations_diffed\": [");

	for (int i = 0; i < CurrentJSONInstruction.memory_diff_count; i++) {
		fprintf(jsonOutput, "%u",
			CurrentJSONInstruction.memoryLocationsDiffed[i]);

		if (i < CurrentJSONInstruction.memory_diff_count - 1)
			fprintf(jsonOutput, ", ");
	}

	fprintf(jsonOutput, "],\n");


	/* new memory values */
	fprintf(jsonOutput, "\t\"memory_values_diffed\": [");

	for (int i = 0; i < CurrentJSONInstruction.memory_diff_count; i++) {
		fprintf(jsonOutput, "%u",
			CurrentJSONInstruction.memoryValuesDiffed[i]);

		if (i < CurrentJSONInstruction.memory_diff_count - 1)
			fprintf(jsonOutput, ", ");
	}

	fprintf(jsonOutput, "],\n");


	/* old memory values */
	fprintf(jsonOutput, "\t\"memory_old_value\": [");

	for (int i = 0; i < CurrentJSONInstruction.memory_diff_count; i++) {
		fprintf(jsonOutput, "%u",
			CurrentJSONInstruction.memory_old_value[i]);

		if (i < CurrentJSONInstruction.memory_diff_count - 1)
			fprintf(jsonOutput, ", ");
	}

	fprintf(jsonOutput, "]\n");

	fprintf(jsonOutput, "}");

	return 0;
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

