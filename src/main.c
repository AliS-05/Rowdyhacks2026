#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <assembler.h>


int main(int argc, char** argv) {
	if(argc > 2){
		printf("Usage, ./assembler <file>\n");
	}
	FILE* file = fopen(argv[1], "rb");
	if(file == NULL){
		printf("Error opening file\n");
		exit(1);
	}
	
	fseek(file, 0, SEEK_END);
	long size = ftell(file);
	rewind(file);

	char *buffer = malloc(size + 1);
	if (!buffer) {
		fclose(file);
		exit(1);
	}

	size_t bytesRead = fread(buffer, 1, size, file);
	fclose(file);

	buffer[bytesRead] = '\0';

	assemble_buffer(buffer);
	return 0;
}

