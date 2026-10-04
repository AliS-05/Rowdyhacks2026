#pragma once
#include <stdint.h>

#define NUM_REGS  17          /* r[0]..r[16] (r[0] is unused) */
#define MEM_SIZE  65535         /* data memory: addresses 0..255 */
#define MAX_INSTR 1024        /* biggest program we accept */
#define MAX_STEPS 100000      /* stops a program that loops forever */
#define MAX_OPERANDS 3
#define MAX_MEMORY_DIFFS 4



typedef enum {
	ADD = 0b0110011,
	ADDI = 0b0010011,

	SUB = 0b0110011,

	LDB = 0b0000011,
	LW = 0b0000011,

	STB = 0b0100011,
	SW = 0b0100011,

	BNE = 0b1100011, 

	HALT = 0xFF //255
} Op;


int load_program(const char *path, unsigned char *program, int max_instr);


extern uint32_t r[NUM_REGS];   

void addi(uint32_t* instruction);
void arithmetic(uint32_t* instruction);
void load(uint32_t* instruction);
void store(uint32_t* instruction);
void bne(uint32_t* instruction);

int execute_instruction(uint32_t* instruction);

int run_program(const unsigned char *program, int count, FILE* jsonOutput);


//global struct to record current state throughout various functions and scopes
struct CurrentJSONInstruction {
	int cycle_number;
	int program_counter;

	char* instruction_mnemonic;
	uint32_t opcode;

	char** operands;
	int operand_count;

	uint32_t* registerStates;

	uint32_t* memoryLocationsDiffed;
	uint8_t* memoryValuesDiffed;
	uint8_t* memory_old_value;
	int memory_diff_count;
};
