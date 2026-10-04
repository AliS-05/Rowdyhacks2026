#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <helpers.h>


//num to s
//to use pass a buffer of max digits of new base
// uint32_t ipAddress -> base 10 number
//ntos(ipAddress, buf (len 4), 10);
char* ntos(int value, char* buf, uint32_t base)
{
	if (base < 2 || base > 16) {
		buf[0] = '\0';
		return NULL;
	}

	static const char digits[] = "0123456789ABCDEF";

	int i = 0;
	int negative = 0;
	uint32_t magnitude;

	if (value < 0 && base == 10) {
		negative = 1;
		magnitude = -(uint32_t)value;
	} else {
		magnitude = (uint32_t)value;
	}

	if (magnitude == 0) {
		buf[i++] = '0';
	} else {
		while (magnitude > 0) {
			buf[i++] = digits[magnitude % base];
			magnitude /= base;
		}
	}

	if (negative)
		buf[i++] = '-';

	buf[i] = '\0';

	for (int left = 0, right = i - 1; left < right; left++, right--) {
		char temp = buf[left];
		buf[left] = buf[right];
		buf[right] = temp;
	}

	return buf;
}
