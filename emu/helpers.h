#pragma once


const char* returnRegisterString(uint8_t reg);

void initCurrentJSONInstruction(void);
void resetCurrentJSONInstruction(int cycle);
void recordInstruction(const char *mnemonic, uint32_t opcode, const char *op1, const char *op2, const char *op3);



