lw r1, 0(r2)
lw r3, 16(r4)
lw r5, 32(r6)

sw r1, 0(r2)
sw r3, 16(r4)
sw r5, 32(r6)

addi r1, r2, 10
addi r3, r4, 20

add r1, r2, r3
sub r4, r5, r6

bne r1, r2, 8
bne r3, r4, 16

halt
