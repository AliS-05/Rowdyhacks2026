# Assemblr

## Usage

- Linux : './run.sh' starts the docker image -> localhost:8080
- Mac  './run.command'
- Windows :

- If docker does not work, `cd frontend && javac Server.java && java Server` then go to `localhost:8080` on your web browser.
- However with this backup option only the preset instructions work as the backend is routed through the JS integrated docker image

<img width="1428" height="730" alt="image" src="https://github.com/user-attachments/assets/ec3cdc72-babc-4f9b-ae72-b3bb2fdb7756" />



## Standalone Usage
'make' creates the assembler executable, syntax -> "./assemblr <filename>", outputs a file named 'asoutput.exe'
For the CPU emulator 'cd /emu \ bash build.sh' then ./emu <binary>
