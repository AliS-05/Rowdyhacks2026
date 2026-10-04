/* script.js
   Parser is pluggable. Load any file before this one that defines either
     window.parseProgram(text, regsText)   or   window.Asm.parseInput(text, regsText)
   See parser.template.js for the accepted return shapes. */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- data ----------
  const PRESETS = [
    { id: "const", asm: "addi r1, r1, 100", what: "Load a constant", rd: 1, rs1: 1, imm: 100, init: {} },
    { id: "count", asm: "addi r7, r7, -1", what: "Count down a loop", rd: 7, rs1: 7, imm: -1, init: { 7: 3 } },
    { id: "copy",  asm: "addi r2, r1, 5",   what: "Copy with an offset", rd: 2, rs1: 1, imm: 5, init: { 1: 100 } },
    { id: "wrap",  asm: "addi r3, r3, -1",  what: "Wrap below zero", rd: 3, rs1: 3, imm: -1, init: {} },
    { id: "add",   asm: "add r3, r1, r2",   what: "Add two registers", op: 1, rd: 3, rs1: 1, rs2: 2, init: { 1: 100, 2: 200 } },
    { id: "sub",   asm: "sub r3, r2, r1",   what: "Subtract", op: 2, rd: 3, rs1: 2, rs2: 1, init: { 1: 100, 2: 200 } },
    { id: "subw",  asm: "sub r3, r1, r2",   what: "Subtract, wrap below zero", op: 2, rd: 3, rs1: 1, rs2: 2, init: { 1: 100, 2: 200 } },
    { id: "lw",    asm: "lw r3, 0(r2)",     what: "Load a word (stored first)", init: { 1: 300, 2: 16 }, program: [
      { op: 7, rd: 1, rs1: 2, imm: 0, asm: "sw r1, 0(r2)" },
      { op: 6, rd: 3, rs1: 2, imm: 0, asm: "lw r3, 0(r2)" },
    ] },
    { id: "sw",    asm: "sw r1, 4(r2)",     what: "Store a word, then load it", init: { 1: 305419896, 2: 16 }, program: [
      { op: 7, rd: 1, rs1: 2, imm: 4, asm: "sw r1, 4(r2)" },
      { op: 6, rd: 3, rs1: 2, imm: 4, asm: "lw r3, 4(r2)" },
    ] },
    { id: "lb",   asm: "lb r4, 0(r2)",    what: "Load one byte (stored first)", init: { 1: 65, 2: 16 }, program: [
      { op: 4, rd: 1, rs1: 2, imm: 0, asm: "sb r1, 0(r2)" },
      { op: 3, rd: 4, rs1: 2, imm: 0, asm: "lb r4, 0(r2)" },
    ] },
    { id: "sb",   asm: "sb r1, -2(r2)",   what: "Store one byte, then load it", init: { 1: 511, 2: 34 }, program: [
      { op: 4, rd: 1, rs1: 2, imm: -2, asm: "sb r1, -2(r2)" },
      { op: 3, rd: 3, rs1: 2, imm: -2, asm: "lb r3, -2(r2)" },
    ] },
    { id: "Halt",  asm: "Halt",             what: "Halt the program", op: 255, rd: 0, rs1: 0, init: {} },
    { id: "prog", asm: "addi, add, sub", what: "Three instructions in a row", init: {}, program: [
      { rd: 1, rs1: 1, imm: 5, asm: "addi r1, r1, 5" },
      { op: 1, rd: 2, rs1: 1, rs2: 1, asm: "add r2, r1, r1" },
      { op: 2, rd: 3, rs1: 2, rs2: 1, asm: "sub r3, r2, r1" },
    ] },
    { id: "bneloop", asm: "addi, bne (loop)", what: "Loop until r1 reaches 3", init: { 2: 3 }, program: [
      { rd: 1, rs1: 1, imm: 1, asm: "addi r1, r1, 1" },
      { op: 8, rd: 0, rs1: 1, rs2: 2, imm: -4, asm: "bne r1, r2, -4" },
      { op: 255, rd: 0, rs1: 0, asm: "halt" },
    ] },
    { id: "bneskip", asm: "bne r1, r2, 8", what: "Jump ahead when different", init: { 1: 5, 2: 7 }, program: [
      { op: 8, rd: 0, rs1: 1, rs2: 2, imm: 8, asm: "bne r1, r2, 8" },
      { rd: 3, rs1: 3, imm: 1, asm: "addi r3, r3, 1" },
      { rd: 4, rs1: 4, imm: 1, asm: "addi r4, r4, 1" },
    ] },
    { id: "bnesame", asm: "bne r1, r2, 8", what: "No jump when equal", init: { 1: 5, 2: 5 }, program: [
      { op: 8, rd: 0, rs1: 1, rs2: 2, imm: 8, asm: "bne r1, r2, 8" },
      { rd: 3, rs1: 3, imm: 1, asm: "addi r3, r3, 1" },
      { rd: 4, rs1: 4, imm: 1, asm: "addi r4, r4, 1" },
    ] },
    { id: "memprog", asm: "addi, sw, addi, lw", what: "Save a value, change it, read it back", init: { 3: 32 }, program: [
      { rd: 1, rs1: 1, imm: 100, asm: "addi r1, r1, 100" },
      { op: 7, rd: 1, rs1: 3, imm: 0, asm: "sw r1, 0(r3)" },
      { rd: 1, rs1: 1, imm: 1, asm: "addi r1, r1, 1" },
      { op: 6, rd: 2, rs1: 3, imm: 0, asm: "lw r2, 0(r3)" },
    ] },
  ];
  const ISA = [
    [1, "add", "rd", "rs1", "rs2", "r[rd] = r[rs1] + r[rs2]"],
    [2, "sub", "rd", "rs1", "rs2", "r[rd] = r[rs1] - r[rs2]"],
    [3, "lb", "rd", "offset(base)", "—", "r[rd] = 1 byte at r[base] + offset"],
    [4, "sb", "rs", "offset(base)", "—", "1 byte at r[base] + offset = r[rs]"],
    [5, "addi", "rd", "rs1", "number", "r[rd] = r[rs1] + number"],
    [6, "lw", "rd", "offset(base)", "—", "r[rd] = 4 bytes at r[base] + offset"],
    [7, "sw", "rs", "offset(base)", "—", "4 bytes at r[base] + offset = r[rs]"],
    [8, "bne", "rs1", "rs2", "offset", "if r[rs1] != r[rs2], pc = pc + offset ÷ 4, else pc + 1"],
    [255, "Halt", "—", "—", "—", "halt the program"],
  ];
  const STAGES = ["Fetch", "Decode", "Read", "Execute", "Memory", "Write back", "Next PC"];
  const MEM_BYTES = 256;
  const NAMES = { 1: "add", 2: "sub", 3: "lb", 4: "sb", 5: "addi", 6: "lw", 7: "sw", 8: "bne", 255: "Halt" };
  const ANIMATED = ["add", "sub", "lb", "sb", "addi", "lw", "sw", "bne", "Halt"];
  const MAX_STEPS = 60;                         // like MAX_STEPS in emu.h: stops a loop that never ends
  const isLoad = (op) => op === 3 || op === 6;
  const isStore = (op) => op === 4 || op === 7;
  const memSize = (op) => (op === 6 || op === 7 ? 4 : 1);
  const MAX_INSTR = 8;

  // ---------- parser plug-in (BEGIN) ----------
  const OPS = { add: 1, sub: 2, lb: 3, lbu: 3, ldb: 3, sb: 4, stb: 4, addi: 5, lw: 6, sw: 7, bne: 8, stop: 255, halt: 255 };
  function normalizeIns(x, i) {
    const where = `Instruction ${i + 1}`;
    let op = typeof x.op === "string" ? OPS[x.op.toLowerCase()]
           : x.op !== undefined ? x.op
           : OPS[String(x.name || x.mnemonic || "addi").toLowerCase()];
    if (!NAMES[op]) throw `${where}: opcode ${x.op ?? x.name} is not animated yet.`;
    // stores keep the register being saved in byte 1 (the rd slot): sw rs, offset(base)
    if (op === 8) {
      const b = { op, rd: 0, rs1: x.rs1 ?? 0, rs2: x.rs2 ?? 0, imm: x.imm ?? x.immediate ?? x.offset ?? 0 };
      const bad = (v) => !Number.isInteger(v) || v < 1 || v > 16;
      if (bad(b.rs1) || bad(b.rs2)) throw `${where}: use registers r1 to r16.`;
      if (!Number.isInteger(b.imm) || b.imm % 4 !== 0 || b.imm < -128 || b.imm > 124) throw `${where}: the bne offset counts bytes, so it must be a multiple of 4 from -128 to 124 (4 = one instruction).`;
      b.asm = x.asm || x.text || `bne r${b.rs1}, r${b.rs2}, ${b.imm}`;
      return b;
    }
    const p = isStore(op)
      ? { op, rd: x.rs2 ?? x.rs ?? x.rd ?? 0, rs1: x.rs1 ?? x.base ?? 0, rs2: 0, imm: x.imm ?? x.immediate ?? x.offset ?? 0 }
      : { op, rd: x.rd ?? 0, rs1: x.rs1 ?? x.rs ?? x.base ?? 0, rs2: x.rs2 ?? 0, imm: x.imm ?? x.immediate ?? x.offset ?? 0 };
    if (op !== 255) {
      const bad = (v, lo) => !Number.isInteger(v) || v < lo || v > 16;
      if (bad(p.rd, 1) || bad(p.rs1, 1) || ((op === 1 || op === 2) && bad(p.rs2, 1))) throw `${where}: use registers r1 to r16.`;
      if (op !== 1 && op !== 2 && (!Number.isInteger(p.imm) || p.imm < -128 || p.imm > 127)) throw `${where}: the number must fit in one signed byte (-128 to 127).`;
    }
    const nm = NAMES[op];
    p.asm = x.asm || x.text || (op === 255 ? "stop"
      : op === 5 ? `addi r${p.rd}, r${p.rs1}, ${p.imm}`
      : isLoad(op) || isStore(op) ? `${nm} r${p.rd}, ${p.imm}(r${p.rs1})`
      : `${nm} r${p.rd}, r${p.rs1}, r${p.rs2}`);
    return p;
  }
  // accepts an array of instructions, or { list | program | instructions, init | regs | registers }
  function normalizeProgram(out) {
    const raw = Array.isArray(out) ? out : (out && (out.list || out.program || out.instructions));
    if (!Array.isArray(raw) || !raw.length) throw "Type at least one instruction.";
    const list = [];
    for (const [i, x] of raw.entries()) { list.push(normalizeIns(x, i)); if (list[i].op === 255) break; }
    const init = (!Array.isArray(out) && (out.init || out.regs || out.registers)) || {};
    for (const k in init) {                  // registers are unsigned 32-bit, whatever the parser allowed
      const v = init[k];
      if (!(Number(k) >= 1 && Number(k) <= 16)) throw `Starting registers must be r1 to r16 (r${k} does not exist).`;
      if (!Number.isInteger(v) || v < 0 || v > 4294967295) throw `r${k} holds an unsigned 32-bit number (0 to 4,294,967,295), so ${v} is not allowed.`;
    }
    return { list, init };
  }
  function runParser(text, regsText) {
    const fn = window.parseProgram || (window.Asm && window.Asm.parseInput);
    if (!fn) throw "No parser loaded. Add a script that defines window.parseProgram(text, regsText) before script.js.";
    return normalizeProgram(fn(text, regsText));
  }
  // ---------- parser plug-in (END) ----------

  // ---------- helpers ----------
  const hex2 = (n) => (n & 0xff).toString(16).padStart(2, "0");
  const hex8 = (n) => "0x" + (n >>> 0).toString(16).padStart(8, "0");
  const fmt = (n) => (n >>> 0).toLocaleString("en-US");
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const txt = (attrs, s, parent) => { const t = el("text", attrs, parent); t.textContent = s; return t; };

  // geometry: 8 compact rows that fit inside the 170px program-memory panel (y 56..226)
  const MEM_ROW_TOP = (i) => 60 + i * 19;
  const MEM_ROW_Y = (i) => MEM_ROW_TOP(i) + 8.5;
  const REG_ROW_TOP = (i) => 66 + (i - 1) * 29;   // r1..r16 (r0 is not shown)
  const REG_ROW_Y = (i) => REG_ROW_TOP(i) + 12.5;
  const IR_X = [316, 406, 496, 586]; const IR_W = 80;

  // ---------- static board ----------
  const memRows = $("memRows"), irCells = $("irCells"), regRows = $("regRows"), traces = $("traces"), packets = $("packets");

  const ptr = el("polygon", { class: "pcptr", points: "22,-7 32,0 22,7" }, $("board"));
  ptr.style.transform = `translateY(${MEM_ROW_Y(0)}px)`;

  // the "count = n instructions" note moves below the rows
  $("memNote").setAttribute("x", "24");
  $("memNote").setAttribute("y", "222");

  const mem = [];
  for (let i = 0; i < MAX_INSTR; i++) {
    const top = MEM_ROW_TOP(i), ty = top + 12.5;
    const row = { rect: el("rect", { class: "cell", x: 36, y: top, width: 214, height: 17, rx: 4 }, memRows) };
    txt({ class: "silk-dim", x: 40, y: ty, style: "font-size:10px;letter-spacing:0" }, String(i), memRows);
    row.bytes = [0, 1, 2, 3].map((b) => txt({ class: "val", x: 54 + b * 22, y: ty, style: "font-size:11.5px" }, "00", memRows));
    row.dis = txt({ class: "silk-dim", x: 140, y: ty, style: "font-size:9.5px;letter-spacing:0" }, "", memRows);
    mem.push(row);
  }

  const ir = IR_X.map((x, i) => {
    const c = { rect: el("rect", { class: "cell", x, y: 72, width: IR_W, height: 44, rx: 5 }, irCells) };
    c.byte = txt({ class: "big", x: x + IR_W / 2, y: 103, "text-anchor": "middle", style: "font-size:20px" }, "--", irCells);
    txt({ class: "silk-dim", x: x + IR_W / 2, y: 134, "text-anchor": "middle" }, ["op", "rd", "rs1", "byte3"][i], irCells);
    c.dec = txt({ class: "decoded", x: x + IR_W / 2, y: 158, "text-anchor": "middle" }, "", irCells);
    return c;
  });

  const regs = [];
  regs.push(null);                              // r0 is unused, so it gets no row
  for (let i = 1; i < 17; i++) {
    const y = REG_ROW_TOP(i);
    const r = { rect: el("rect", { class: "cell", x: 736, y, width: 218, height: 25, rx: 4 }, regRows) };
    txt({ class: "silk", x: 746, y: y + 17.5, style: "font-size:13px" }, "r" + i, regRows);
    r.hex = txt({ class: "val dim", x: 774, y: y + 17.5, style: "font-size:12px" }, hex8(0), regRows);
    r.dec = txt({ class: "val", x: 944, y: y + 17.5, "text-anchor": "end", style: "font-size:12px" }, "0", regRows);
    regs.push(r);
  }

  // traces: static ones built once, register ones rebuilt per instruction
  const path = (d, cls = "trace") => el("path", { d, class: cls }, traces);
  const T = {
    fetch: path(`M250,${MEM_ROW_Y(0)} H278 V94 H316`),
    addr: path("M91,318 V226"),
    pcAdd: path("M146,348 H186"),
    pcBack: path("M206,368 V392 H120 V378"),
    imm: path(`M626,176 V192 H415 V300`),       // byte 3 (the number) -> ALU input
    ctrl: path("M356,176 V188 H330 V340 H397", "trace ctrl"),
  };
  T.read = path("M0,0"); T.read2 = path("M0,0"); T.write = path("M0,0");
  T.br = path("M646,176 V268 H286 V348 H226", "trace");     // branch offset (byte 3) -> pc adder
  T.memAddr = path("M512,380 V416 H562");       // ALU result -> data memory address input
  T.memIn = path("M0,0");                       // register being stored -> data memory
  T.memOut = path("M0,0");                      // loaded value -> register file

  // ---------- data memory: a block on the board, and the byte grid in the side card ----------
  const dmBox = el("rect", { class: "cell", id: "dmBox", x: 562, y: 396, width: 134, height: 60, rx: 6 }, $("board"));
  txt({ class: "title", x: 562, y: 386 }, "DATA MEMORY", $("board"));
  txt({ class: "silk-dim", x: 570, y: 419, style: "font-size:10.5px;letter-spacing:0" }, "addr", $("board"));
  txt({ class: "silk-dim", x: 570, y: 443, style: "font-size:10.5px;letter-spacing:0" }, "data", $("board"));
  const dmAddr = txt({ class: "val", x: 689, y: 419, "text-anchor": "end", style: "font-size:11.5px" }, "—", $("board"));
  const dmData = txt({ class: "val", x: 689, y: 443, "text-anchor": "end", style: "font-size:11.5px" }, "—", $("board"));
  $("board").appendChild(packets);              // keep moving values above the new block

  const dmGrid = $("dmGrid"), dmScroll = $("dmScroll");
  const dmCells = [];
  dmGrid.appendChild(Object.assign(document.createElement("span"), { className: "dm-corner" }));
  for (let c = 0; c < 16; c++) {
    dmGrid.appendChild(Object.assign(document.createElement("span"), { className: "dm-col", textContent: "+" + c.toString(16) }));
  }
  for (let row = 0; row < MEM_BYTES / 16; row++) {
    dmGrid.appendChild(Object.assign(document.createElement("span"), { className: "dm-addr", textContent: hex2(row * 16) }));
    for (let c = 0; c < 16; c++) {
      const cell = document.createElement("span");
      cell.className = "dm-cell";
      cell.title = `byte ${row * 16 + c} (0x${hex2(row * 16 + c)})`;
      dmGrid.appendChild(cell);
      dmCells.push(cell);
    }
  }

  // ---------- state ----------
  let preset = PRESETS[0];
  let program = [];
  let R = new Uint32Array(17);
  let DM = new Uint8Array(MEM_BYTES);
  let DMsrc = new Array(MEM_BYTES).fill(null);  // which instruction last wrote each byte ("start" = preset value)
  let pc = 0, stage = 0, busy = false, playing = false, halted = false, executed = 0, crashed = false;

  function setTraceRoutes() {
    const p = program[pc] || program[0];
    const two = p.op === 1 || p.op === 2 || p.op === 8;
    const ry = REG_ROW_Y(two ? p.rs2 : p.rs1) - 5;
    const wy = REG_ROW_Y(p.rd) + 5;
    T.read2.setAttribute("d", two ? `M736,${REG_ROW_Y(p.rs1) - 5} H712 V292 H415 V300` : "M0,0");
    T.read.setAttribute("d", `M736,${ry} H700 V284 H525 V300`);
    T.write.setAttribute("d", `M470,380 V500 H714 V${wy} H736`);
    T.memOut.setAttribute("d", `M633,456 V500 H714 V${wy} H736`);
    T.memIn.setAttribute("d", isStore(p.op) ? `M736,${REG_ROW_Y(p.rd) + 5} H706 V426 H694` : "M0,0");
  }

  function hot(node, on) { node.classList.toggle("hot", on); }
  function clearHot() {
    document.querySelectorAll("#board .hot").forEach((n) => n.classList.remove("hot"));
  }
  // blank the instruction register and ALU readouts between instructions
  function clearDatapath() {
    packets.textContent = "";
    ir.forEach((c) => { c.byte.textContent = "--"; c.dec.textContent = ""; });
    $("aluOp").textContent = "idle";
    $("aluA").textContent = "";
    $("aluOut").textContent = "";
    dmAddr.textContent = "—"; dmData.textContent = "—";
    $("adderTxt").textContent = "+1";
    dmCells.forEach((c) => c.classList.remove("tgt", "rd", "wr"));
    setBus("—", "—", "idle", "");
  }

  // ---------- data memory card ----------
  function renderMem() {
    DM.forEach((v, i) => {
      dmCells[i].textContent = hex2(v);
      dmCells[i].classList.toggle("nz", v !== 0);
    });
  }
  function setBus(addr, data, op, note) {
    $("busAddr").textContent = addr;
    $("busData").textContent = data;
    $("busOp").textContent = op;
    $("busOp").dataset.op = op;
    if (note !== undefined) $("memMsg").innerHTML = note;
  }
  // scroll the grid (not the page) so the row holding addr is in view
  function showRow(addr) {
    const cell = dmCells[Math.min(addr, MEM_BYTES - 1)];
    const top = Math.max(0, cell.offsetTop - 17 - 19);   // under the sticky header, with one row above for context
    if (reduce) dmScroll.scrollTop = top; else dmScroll.scrollTo({ top, behavior: "smooth" });
  }
  const span = (a, n) => (n === 1 ? `0x${hex2(a)}` : `0x${hex2(a)}–0x${hex2(a + n - 1)}`);

  function renderRegs() {
    for (let i = 1; i < 17; i++) {
      regs[i].hex.textContent = hex8(R[i]);
      regs[i].dec.textContent = fmt(R[i]);
      regs[i].hex.classList.toggle("dim", R[i] === 0);
    }
  }

  function bytesOf(p) {
    const op = p.op || 5;
    if (op === 255) return [255, 0, 0, 0];
    if (op === 8) return [8, p.rs1, p.rs2, p.imm & 0xff];
    return [op, p.rd, p.rs1, (op === 1 || op === 2) ? p.rs2 : p.imm & 0xff];
  }

  function reset() {
    playing = false; halted = false;
    R = new Uint32Array(17);
    for (const k in preset.init) R[k] = preset.init[k];
    DM = new Uint8Array(MEM_BYTES);
    DMsrc = new Array(MEM_BYTES).fill(null);
    for (const a in preset.mem || {}) preset.mem[a].forEach((v, j) => { DM[Number(a) + j] = v; DMsrc[Number(a) + j] = "start"; });
    dmCells.forEach((c) => c.classList.remove("changed"));
    pc = 0; stage = 0; executed = 0; crashed = false;
    $("adderTxt").textContent = "+1";
    clearHot();
    clearDatapath();
    program = preset.program || [preset];
    setTraceRoutes();

    mem.forEach((row) => {
      row.bytes.forEach((b) => (b.textContent = "00"));
      row.dis.textContent = "";
    });
    program.forEach((p, i) => {
      if (i >= mem.length) return;
      bytesOf(p).forEach((v, j) => (mem[i].bytes[j].textContent = hex2(v)));
      mem[i].dis.textContent = p.asm;
    });
    $("memNote").textContent = `count = ${program.length} instruction${program.length === 1 ? "" : "s"}`;

    $("pcVal").textContent = "0";
    ptr.style.transform = `translateY(${MEM_ROW_Y(0)}px)`;
    renderRegs();
    renderMem();
    const memInit = Object.entries(preset.mem || {});
    setBus("—", "—", "idle", memInit.length
      ? memInit.map(([a, b]) => `Bytes <span class="m">${span(Number(a), b.length)}</span> start as <span class="m">${b.map(hex2).join(" ")}</span>.`).join(" ") + " Every other byte is 0."
      : "All 256 bytes start at 0. Load and store instructions read and write here.");
    showRow(memInit.length ? Number(memInit[0][0]) : 0);

    const startNote = Object.keys(preset.init).length
      ? "Starting state: " + Object.entries(preset.init).map(([k, v]) => `r${k} = ${v}`).join(", ") + ". Every other register is 0."
      : "Starting state: every register is 0.";
    showStage(-1, "Ready",
      `The program contains <span class="m">${program.length}</span> instruction${program.length === 1 ? "" : "s"}. ${startNote} Press Play to watch it run, or Step to go one stage at a time.`);
    updateButtons();
  }

  // ---------- narration ----------
  function showStage(i, title, html) {
    const lis = $("steps").children;
    for (let k = 0; k < lis.length; k++) lis[k].className = k < i ? "done" : k === i ? "now" : "";
    $("stageTitle").textContent = title;
    $("stageText").innerHTML = html;
  }

  // ---------- animation primitives ----------
  const speed = () => parseFloat($("speedSel").value) || 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms / speed()));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function travel(p, label, ms = 1100) {
    return new Promise((resolve) => {
      const len = p.getTotalLength();
      const g = el("g", { class: "packet" }, packets);
      const w = label.length * 8.2 + 16;
      el("rect", { x: -w / 2, y: -12, width: w, height: 24, rx: 6 }, g);
      txt({ x: 0, y: 4.5, "text-anchor": "middle" }, label, g);
      p.classList.add("live");
      const dur = reduce ? 0 : ms / speed();
      const t0 = performance.now();
      const frame = (now) => {
        const k = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
        const pt = p.getPointAtLength(len * ease(k));
        g.setAttribute("transform", `translate(${pt.x},${pt.y})`);
        if (k < 1) requestAnimationFrame(frame);
        else { g.remove(); p.classList.remove("live"); resolve(); }
      };
      requestAnimationFrame(frame);
    });
  }
  function flash(node) {
    node.classList.remove("flash"); void node.getBBox(); node.classList.add("flash");
  }

  // ---------- the six stages ----------
  // jump = how many instructions to move (1 normally; offset ÷ 4 for a taken bne)
  async function advancePc(narration, jump = 1) {
    showStage(6, "Next PC", narration);
    const target = pc + jump;
    if (jump !== 1) {
      hot(ir[3].rect, true);
      await travel(T.br, (jump > 0 ? "+" : "") + jump, 900);
      hot(ir[3].rect, false);
      $("adderTxt").textContent = (jump > 0 ? "+" : "−") + Math.abs(jump);
    }
    hot($("adder"), true);
    await travel(T.pcAdd, String(pc), 600);
    await travel(T.pcBack, String(target), 800);
    pc = target;
    $("pcVal").textContent = String(pc);
    if (pc < 0 || pc > program.length) crashed = true;   // like run_program(): pc outside the program
    if (pc >= 0 && pc < mem.length) {
      ptr.style.transform = `translateY(${MEM_ROW_Y(pc)}px)`;
      hot(mem[pc].rect, true);
    }
    hot($("adder"), false);
  }

  function stageFns() {
    const p = program[pc], op = p.op || 5, reg2 = op === 1 || op === 2, b = bytesOf(p);
    const load = isLoad(op), store = isStore(op), memOp = load || store, n = memSize(op);
    const name = NAMES[op], sym = op === 2 ? "−" : "+";
    const a = R[p.rs1], bv = reg2 ? R[p.rs2] : (p.imm >>> 0);
    const result = op === 2 ? (a - bv) >>> 0 : (a + bv) >>> 0;      // for loads and stores this is the address
    const addr = result;
    const oob = memOp && addr > MEM_BYTES - n;
    const signNote = p.imm < 0
      ? `Byte 3 is <span class="m">0x${hex2(b[3])}</span>. Its top bit is set, so as a signed 8-bit number it means <span class="m">${p.imm}</span>.`
      : `Byte 3 is <span class="m">0x${hex2(b[3])}</span>, which is <span class="m">${p.imm}</span> as a signed 8-bit number.`;
    const sum = a + p.imm;
    const wrapNote = sum < 0
      ? ` Registers are unsigned 32-bit, so going below zero wraps around to <span class="m">${fmt(result)}</span>.`
      : sum > 0xFFFFFFFF
      ? ` Registers are unsigned 32-bit, so going past 4,294,967,295 wraps around to <span class="m">${fmt(result)}</span>.`
      : "";
    const addrTxt = oob ? fmt(addr) : `0x${hex2(addr)} (${addr})`;
    // what a load will read, assembled lowest byte first (little-endian)
    const loaded = oob ? 0 : Array.from({ length: n }, (_, j) => DM[addr + j]).reduce((v, x, j) => (v + x * 2 ** (8 * j)), 0) >>> 0;
    const storeVal = R[p.rd];
    const storeBytes = Array.from({ length: n }, (_, j) => (storeVal >>> (8 * j)) & 0xff);
    const regVal = load ? loaded : result;                             // what write back puts in rd
    // where the bytes a load reads came from: an earlier store, the preset's starting memory, or never written
    const origin = (() => {
      if (!load || oob) return "";
      const srcs = [...new Set(Array.from({ length: n }, (_, j) => DMsrc[addr + j]))];
      const one = (s) => s === null ? "never written, so still 0"
        : s === "start" ? "set before the program started"
        : `saved by instruction ${s}, <span class="m">${program[s].asm}</span>`;
      const what = n === 1 ? "This byte was" : "These bytes were";
      return srcs.length === 1 ? `${what} ${one(srcs[0])}.` : `The bytes come from more than one place: ${srcs.map(one).join("; ")}.`;
    })();

    const fetch = async () => {
      showStage(0, "Fetch", `The program counter holds <span class="m">${pc}</span>, so the CPU reads the 4 bytes at instruction ${pc}: <span class="m">${b.map(hex2).join(" ")}</span>. Every instruction in this CPU is exactly 4 bytes long.`);
      hot($("pcCell"), true); hot(mem[pc].rect, true);
      await travel(T.addr, "pc " + pc, 800);
      T.fetch.setAttribute("d", `M250,${MEM_ROW_Y(pc)} H278 V94 H316`);
      await travel(T.fetch, b.map(hex2).join(" "), 1300);
      b.forEach((v, i) => { ir[i].byte.textContent = hex2(v); hot(ir[i].rect, true); });
      hot($("pcCell"), false); hot(mem[pc].rect, false);
      await wait(350);
      ir.forEach((c) => hot(c.rect, false));
    };
    const memIdle = (why) => async () => {
      showStage(4, "Memory", why);
      setBus("—", "—", "idle", `<span class="m">${name}</span> does not use data memory.`);
      await wait(800);
    };

    if (op === 255) {
      return [
        fetch,
        async () => { showStage(1, "Decode", `Byte 0 is the opcode: <span class="m">255</span> means <span class="m">stop</span>. Bytes 1 to 3 are not used.`); hot(ir[0].rect, true); ir[0].dec.textContent = "STOP"; await wait(900); ir.forEach((c) => hot(c.rect, false)); },
        async () => { showStage(2, "Read", `Stop reads no registers, so nothing travels to the ALU.`); await wait(900); },
        async () => { showStage(3, "Execute", `Nothing to compute. The CPU only sets <span class="m">stopped = 1</span>.`); $("aluOp").textContent = "halt"; hot($("alu"), true); await wait(900); hot($("alu"), false); },
        memIdle(`Stop does not read or write data memory.`),
        async () => { showStage(5, "Write back", `Stop writes nothing. Every register keeps its value.`); await wait(900); },
        () => advancePc(`The pc still moves to <span class="m">${pc} + 1 = ${pc + 1}</span>, but <span class="m">execute_instruction()</span> returned 1, so <span class="m">run_program()</span> ends the program here.`),
      ];
    }

    if (op === 8) {
      const x = R[p.rs1], y = R[p.rs2], taken = x !== y, k = p.imm / 4, diff = (x - y) >>> 0;
      const target = pc + (taken ? k : 1);
      const where = target < 0 || target > program.length ? `That is outside the program (instructions 0 to ${program.length - 1}), so the CPU stops with an error, like <span class="m">run_program()</span> does.`
        : target === program.length ? "There is no instruction there, so the program is complete."
        : `The CPU will fetch instruction <span class="m">${target}</span> next: <span class="m">${program[target].asm}</span>.`;
      return [
        fetch,
        async () => {
          showStage(1, "Decode", `Byte 0 is the opcode: <span class="m">8</span> means <span class="m">bne</span>, branch if not equal. Byte 1 is <span class="m">r${p.rs1}</span> and byte 2 is <span class="m">r${p.rs2}</span>, the two registers to compare. Byte 3 is the offset in bytes. ${signNote} Each instruction is 4 bytes, so <span class="m">${p.imm}</span> bytes means <span class="m">${k > 0 ? "+" : ""}${k}</span> instruction${Math.abs(k) === 1 ? "" : "s"}.`);
          hot(ir[0].rect, true); ir[0].dec.textContent = "BNE"; await wait(450);
          hot(ir[1].rect, true); ir[1].dec.textContent = "r" + p.rs1; await wait(350);
          hot(ir[2].rect, true); ir[2].dec.textContent = "r" + p.rs2; await wait(350);
          hot(ir[3].rect, true); ir[3].dec.textContent = "offset";
          await travel(T.ctrl, "sub", 1000);
          $("aluOp").textContent = "op: compare";
          await wait(400);
          ir.forEach((c) => hot(c.rect, false));
        },
        async () => {
          showStage(2, "Read", `The register file sends <span class="m">r${p.rs1}</span> = <span class="m">${fmt(x)}</span> to ALU input A and <span class="m">r${p.rs2}</span> = <span class="m">${fmt(y)}</span> to input B. The offset stays in the instruction register until the CPU knows whether to jump.`);
          hot(regs[p.rs1].rect, true); hot(regs[p.rs2].rect, true);
          await Promise.all([travel(T.read2, fmt(x), 1300), travel(T.read, fmt(y), 1300)]);
          hot(regs[p.rs1].rect, false); hot(regs[p.rs2].rect, false);
          $("aluA").textContent = `A = ${fmt(x)}  B = ${fmt(y)}`;
        },
        async () => {
          showStage(3, "Execute", `The ALU compares the two values by subtracting: <span class="m">${fmt(x)} − ${fmt(y)}</span> ${taken ? "is not 0" : "is 0"}, so the registers are ${taken ? "<b>different</b> and the branch is <b>taken</b>" : "<b>equal</b> and the branch is <b>not taken</b>"}.`);
          hot($("alu"), true);
          $("aluOp").textContent = `${fmt(x)} − ${fmt(y)}`;
          await wait(900);
          $("aluOut").textContent = taken ? "≠ jump" : "= no jump";
          await wait(700);
          hot($("alu"), false);
        },
        memIdle(`bne does not read or write data memory. It only decides where the program goes next.`),
        async () => { showStage(5, "Write back", `bne writes no register. Its only effect is on the program counter.`); await wait(900); },
        () => advancePc(taken
          ? `The branch is taken, so the offset goes to the pc adder instead of +1: <span class="m">pc = ${pc} + (${p.imm} ÷ 4) = ${pc} ${k < 0 ? "−" : "+"} ${Math.abs(k)} = ${target}</span>. ${k <= 0 ? "Jumping backwards makes a loop. " : `Instruction${k - 1 === 1 ? "" : "s"} in between ${k - 1 === 1 ? "is" : "are"} skipped. `}${where}`
          : `The registers are equal, so the branch is not taken and the program counter moves on as usual: <span class="m">${pc} + 1 = ${pc + 1}</span>. ${where}`,
          taken ? k : 1),
      ];
    }

    const decodeText = reg2
      ? `Byte 0 is the opcode: <span class="m">${op}</span> means <span class="m">${name}</span>. Byte 1 is the destination <span class="m">r${p.rd}</span>, byte 2 is the first source <span class="m">r${p.rs1}</span>, and byte 3 is the second source <span class="m">r${p.rs2}</span>. For add and sub, byte 3 is a register, not a number, not a number. All three register numbers pass the range check.`
      : load
      ? `Byte 0 is the opcode: <span class="m">${op}</span> means <span class="m">${name}</span>, load ${n === 4 ? "a 4-byte word" : "one byte"} from memory. Byte 1 is the destination <span class="m">r${p.rd}</span>, byte 2 is the base register <span class="m">r${p.rs1}</span>, and byte 3 is the offset. ${signNote}`
      : store
      ? `Byte 0 is the opcode: <span class="m">${op}</span> means <span class="m">${name}</span>, store ${n === 4 ? "a 4-byte word" : "one byte"} in memory. Byte 1 is the register to save, <span class="m">r${p.rd}</span>, byte 2 is the base register <span class="m">r${p.rs1}</span>, and byte 3 is the offset. ${signNote}`
      : `Byte 0 is the opcode: <span class="m">5</span> means <span class="m">addi</span>. Byte 1 picks the destination register <span class="m">r${p.rd}</span> and byte 2 the source <span class="m">r${p.rs1}</span>. Both pass the range check (r1 to r16 for a destination). ${signNote}`;

    return [
      fetch,
      async () => {
        showStage(1, "Decode", decodeText);
        hot(ir[0].rect, true); ir[0].dec.textContent = name.toUpperCase(); await wait(450);
        hot(ir[1].rect, true); ir[1].dec.textContent = "r" + p.rd; await wait(350);
        hot(ir[2].rect, true); ir[2].dec.textContent = memOp ? "base r" + p.rs1 : "r" + p.rs1; await wait(350);
        hot(ir[3].rect, true); ir[3].dec.textContent = reg2 ? "r" + p.rs2 : memOp ? "offset" : "imm";
        await travel(T.ctrl, reg2 ? name : "add", 1000);
        $("aluOp").textContent = "op: " + (memOp ? "add" : name);
        await wait(400);
        ir.forEach((c) => hot(c.rect, false));
      },
      async () => {
        if (reg2) {
          showStage(2, "Read", `The register file sends <span class="m">r${p.rs1}</span>, which holds <span class="m">${fmt(a)}</span>, to ALU input A and <span class="m">r${p.rs2}</span>, which holds <span class="m">${fmt(bv)}</span>, to input B.`);
          hot(regs[p.rs1].rect, true); hot(regs[p.rs2].rect, true);
          await Promise.all([travel(T.read2, fmt(a), 1300), travel(T.read, fmt(bv), 1300)]);
          hot(regs[p.rs1].rect, false); hot(regs[p.rs2].rect, false);
          $("aluA").textContent = `A = ${fmt(a)}  B = ${fmt(bv)}`;
          return;
        }
        if (store) {
          showStage(2, "Read", `Two registers are read. The base <span class="m">r${p.rs1}</span> = <span class="m">${fmt(a)}</span> goes to ALU input A and the offset <span class="m">${p.imm}</span> to input B. The value to save, <span class="m">r${p.rd}</span> = <span class="m">${hex8(storeVal)}</span>, goes to the data memory's data input.`);
          hot(regs[p.rs1].rect, true); hot(regs[p.rd].rect, true);
          await Promise.all([travel(T.read, fmt(a), 1300), travel(T.imm, String(p.imm), 1300), travel(T.memIn, hex8(storeVal), 1300)]);
          hot(regs[p.rs1].rect, false); hot(regs[p.rd].rect, false);
          dmData.textContent = hex8(storeVal);
          setBus("—", hex8(storeVal), "idle", `Data waiting at the memory: <span class="m">${hex8(storeVal)}</span>${n === 1 ? `. Only its lowest byte, <span class="m">0x${hex2(storeVal)}</span>, will be saved.` : "."}`);
          $("aluA").textContent = `A = ${fmt(a)}  B = ${p.imm}`;
          return;
        }
        showStage(2, "Read", `The register file sends ${load ? "the base " : ""}<span class="m">r${p.rs1}</span>, which holds <span class="m">${fmt(a)}</span>, to ALU input A. The ${load ? "offset" : "number"} <span class="m">${p.imm}</span> from byte 3 of the instruction goes to input B.`);
        hot(regs[p.rs1].rect, true);
        await Promise.all([travel(T.read, fmt(a), 1300), travel(T.imm, String(p.imm), 1300)]);
        hot(regs[p.rs1].rect, false);
        $("aluA").textContent = `A = ${fmt(a)}  B = ${p.imm}`;
      },
      async () => {
        if (reg2) {
          const wraps = op === 2 ? a < bv : a + bv > 0xFFFFFFFF;
          showStage(3, "Execute", `The ALU ${op === 2 ? "subtracts" : "adds"} the two inputs: <span class="m">${fmt(a)} ${sym} ${fmt(bv)} = ${fmt(result)}</span>.${wraps ? " Registers are unsigned 32-bit, so the result wraps around." : ""}`);
          hot($("alu"), true);
          $("aluOp").textContent = `${fmt(a)} ${sym} ${fmt(bv)}`;
          await wait(900);
          $("aluOut").textContent = "= " + fmt(result);
          await wait(500);
          hot($("alu"), false);
          return;
        }
        showStage(3, "Execute", memOp
          ? `The ALU works out the memory address: base + offset = <span class="m">${fmt(a)} + (${p.imm}) = ${fmt(addr)}</span>. ${oob ? `That is outside the 256 bytes of data memory.` : `The address goes to the data memory.`}`
          : `The ALU adds the two inputs: <span class="m">${fmt(a)} + (${p.imm}) = ${fmt(result)}</span>.${wrapNote}`);
        hot($("alu"), true);
        $("aluOp").textContent = `${fmt(a)} ${p.imm < 0 ? "−" : "+"} ${Math.abs(p.imm)}`;
        await wait(900);
        $("aluOut").textContent = "= " + fmt(result);
        await wait(500);
        hot($("alu"), false);
        if (memOp) {
          await travel(T.memAddr, oob ? fmt(addr) : "0x" + hex2(addr), 900);
          dmAddr.textContent = oob ? "out of range" : "0x" + hex2(addr);
          if (!oob) {
            showRow(addr);
            for (let j = 0; j < n; j++) dmCells[addr + j].classList.add("tgt");
          }
          setBus(addrTxt, store ? hex8(storeVal) : "—", "idle", oob
            ? `Address <span class="m">${fmt(addr)}</span> is past the last byte (255). The C code prints <span class="m">ERROR: MEMORY OOB</span> and skips the access.`
            : `Address <span class="m">${addrTxt}</span> selects ${n === 1 ? "one byte" : `bytes <span class="m">${span(addr, n)}</span>`}.`);
        }
      },
      // ---------- memory stage ----------
      !memOp ? memIdle(`<span class="m">${name}</span> does not read or write data memory, so this stage does nothing. The ALU result <span class="m">${fmt(result)}</span> passes straight through to write back.`)
      : oob ? async () => {
          showStage(4, "Memory", `The address <span class="m">${fmt(addr)}</span> is outside data memory, so nothing is ${load ? "read" : "written"}.`);
          setBus(addrTxt, "—", "error");
          hot(dmBox, true); await wait(1200); hot(dmBox, false);
        }
      : load ? async () => {
          showStage(4, "Memory", `Data memory reads ${n === 1 ? `the byte at <span class="m">0x${hex2(addr)}</span>` : `the 4 bytes at <span class="m">${span(addr, 4)}</span>`}. ${n === 4 ? `They are joined lowest byte first (little-endian), so <span class="m">${Array.from({ length: 4 }, (_, j) => hex2(DM[addr + j])).join(" ")}</span> becomes <span class="m">${hex8(loaded)}</span> = <span class="m">${fmt(loaded)}</span>.` : `It holds <span class="m">0x${hex2(loaded)}</span> = <span class="m">${loaded}</span>; the other 3 bytes of the register will be 0.`} ${origin}`);
          hot(dmBox, true);
          let acc = 0;
          for (let j = 0; j < n; j++) {
            const c = dmCells[addr + j];
            c.classList.remove("tgt"); c.classList.add("rd");
            acc = (acc + DM[addr + j] * 2 ** (8 * j)) >>> 0;
            const shown = "0x" + Array.from({ length: 4 }, (_, k) => (3 - k < j + 1 ? hex2(acc >>> (8 * (3 - k))) : "··")).join("");
            setBus(addrTxt, shown, "read", `Reading byte <span class="m">0x${hex2(addr + j)}</span> = <span class="m">0x${hex2(DM[addr + j])}</span>${n === 4 ? `, which fills bits ${8 * j} to ${8 * j + 7}` : ""}.`);
            dmData.textContent = shown;
            await wait(n === 1 ? 900 : 550);
          }
          dmData.textContent = hex8(loaded);
          setBus(addrTxt, hex8(loaded), "read", `Read <span class="m">${hex8(loaded)}</span> = <span class="m">${fmt(loaded)}</span>. ${origin} A load only copies, so memory is unchanged.`);
          await wait(500);
          hot(dmBox, false);
        }
      : async () => {
          showStage(4, "Memory", n === 4
            ? `Data memory writes <span class="m">${hex8(storeVal)}</span> into bytes <span class="m">${span(addr, 4)}</span>, lowest byte first (little-endian): <span class="m">${storeBytes.map(hex2).join(" ")}</span>.`
            : `Data memory writes the lowest byte of <span class="m">r${p.rd}</span>, <span class="m">0x${hex2(storeVal)}</span>, into byte <span class="m">0x${hex2(addr)}</span>. The other 3 bytes of the register are not saved.`);
          hot(dmBox, true);
          for (let j = 0; j < n; j++) {
            const c = dmCells[addr + j], old = DM[addr + j];
            DM[addr + j] = storeBytes[j]; DMsrc[addr + j] = pc;
            c.classList.remove("tgt", "wr"); void c.offsetWidth; c.classList.add("wr", "changed");
            c.textContent = hex2(storeBytes[j]); c.classList.toggle("nz", storeBytes[j] !== 0);
            setBus(addrTxt, hex8(storeVal), "write", `Byte <span class="m">0x${hex2(addr + j)}</span>: <span class="m">${hex2(old)} → ${hex2(storeBytes[j])}</span>${n === 4 ? ` (bits ${8 * j} to ${8 * j + 7} of the value)` : ""}.`);
            await wait(n === 1 ? 900 : 550);
          }
          setBus(addrTxt, hex8(storeVal), "write", `Saved. ${n === 4 ? `Bytes <span class="m">${span(addr, 4)}</span> now hold <span class="m">${storeBytes.map(hex2).join(" ")}</span>.` : `Byte <span class="m">0x${hex2(addr)}</span> now holds <span class="m">${hex2(storeBytes[0])}</span>.`} The registers do not change.`);
          await wait(500);
          hot(dmBox, false);
        },
      // ---------- write back ----------
      async () => {
        if (store) {
          showStage(5, "Write back", `${name} writes no register. Its result is the change in data memory.`);
          await wait(900);
          return;
        }
        if (load && oob) {
          showStage(5, "Write back", `The load was skipped, so <span class="m">r${p.rd}</span> keeps <span class="m">${fmt(R[p.rd])}</span>.`);
          await wait(900);
          return;
        }
        showStage(5, "Write back", load
          ? `The value read from memory, <span class="m">${fmt(loaded)}</span>, goes into <span class="m">r${p.rd}</span>.`
          : `The result goes into <span class="m">r${p.rd}</span>. ${p.rd === p.rs1 ? "Source and destination are the same register, so its old value is replaced." : `r${p.rs1} keeps its value; only r${p.rd} changes.`}`);
        await travel(load ? T.memOut : T.write, fmt(regVal), 1300);
        R[p.rd] = regVal; renderRegs();
        hot(regs[p.rd].rect, true); flash(regs[p.rd].rect);
        await wait(700);
        hot(regs[p.rd].rect, false);
      },
      () => {
        const next = program[pc + 1];
        const final = store
          ? (oob ? "" : `Memory at <span class="m">${span(addr, n)}</span> now holds <span class="m">${storeBytes.map(hex2).join(" ")}</span>.`)
          : `Final value: <span class="m">r${p.rd} = ${fmt(R[p.rd])}</span>.`;
        return advancePc(next
          ? `${name} never jumps, so the program counter becomes <span class="m">${pc} + 1 = ${pc + 1}</span>. The CPU will fetch instruction <span class="m">${pc + 1}</span> next: <span class="m">${next.asm}</span>. ${final}`
          : `${name} never jumps, so the program counter becomes <span class="m">${pc} + 1 = ${pc + 1}</span>. There are no more instructions, so the program is complete. ${final}`);
      },
    ];
  }

  // ---------- controls ----------
  async function step() {
    if (busy || halted || pc >= program.length) return;
    busy = true; updateButtons();

    const cur = program[pc];
    await stageFns()[stage]();
    stage++;

    if (stage >= STAGES.length) {
      executed++;
      if (crashed) {
        halted = true;
        showStage(-1, "Stopped", `The program counter is <span class="m">${pc}</span>, which is outside the program. The C emulator stops here with <span class="m">Error: pc=${pc} is outside the program</span>.`);
      } else if (executed >= MAX_STEPS && cur.op !== 255 && pc < program.length) {
        halted = true;
        showStage(-1, "Stopped", `The CPU has run <span class="m">${MAX_STEPS}</span> instructions without reaching halt, so the page stops it here. The two registers that bne compares probably never become equal (an infinite loop).`);
      } else if (cur.op === 255 || pc >= program.length) {
        halted = true;                       // stop executed, or ran off the end
        for (const li of $("steps").children) li.className = "done";
      } else {
        stage = 0;                           // load the next instruction
        clearHot(); clearDatapath(); setTraceRoutes();
      }
    }
    busy = false; updateButtons();
  }
  async function play() {
    if (halted || pc >= program.length) reset();
    playing = true; updateButtons();
    while (playing && !halted && pc < program.length) {
      await step();
      if (playing && !halted) await wait(450);
    }
    playing = false; updateButtons();
  }
  function updateButtons() {
    const done = halted || pc >= program.length;
    $("playBtn").textContent = playing ? "Pause" : done ? "Replay" : (stage > 0 || pc > 0) ? "Resume" : "Play";
    $("stepBtn").disabled = busy || playing || done;
    $("resetBtn").disabled = busy || playing;
    document.querySelectorAll("#presetChips .chip").forEach((c) => (c.disabled = busy || playing));
  }

  $("playBtn").addEventListener("click", () => { if (playing) { playing = false; updateButtons(); } else play(); });
  $("stepBtn").addEventListener("click", step);
  $("resetBtn").addEventListener("click", reset);

  // ---------- presets + table ----------
  const pc_ = $("presetChips");
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.id = "preset-" + p.id;
    b.setAttribute("aria-pressed", p === preset ? "true" : "false");
    b.innerHTML = `<span class="asm">${p.asm}</span><span class="what">${p.what}</span>`;
    b.addEventListener("click", () => {
      preset = p;
      pc_.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === b ? "true" : "false"));
      reset();
    });
    pc_.appendChild(b);
  });
  $("steps").innerHTML = STAGES.map((s) => `<li>${s}</li>`).join("");
  $("isaBody").innerHTML = ISA.map(([op, n, a, bb, c, d]) =>
    `<tr><td class="mono">${op}</td><td class="mono"><b>${n}</b></td><td class="mono">${a}</td><td class="mono">${bb}</td><td class="mono">${c}</td><td>${d}</td><td><span class="pill${ANIMATED.includes(n) ? " live" : ""}">${ANIMATED.includes(n) ? "animated" : "next"}</span></td></tr>`
  ).join("");

  // ---------- your own input (parsing lives in parser.js) ----------
  function loadInput() {
    if (busy || playing) { $("inErr").textContent = "Pause or finish the current run first."; return; }
    try {
      const res = runParser($("inAsm").value, $("inRegs").value);
      if (res.list.length > MAX_INSTR) throw `The board has ${MAX_INSTR} instruction slots, so enter at most ${MAX_INSTR} instructions.`;
      $("inErr").textContent = "";
      preset = { id: "custom", asm: res.list.map((p) => p.asm).join("; "), what: "Your input", init: res.init, program: res.list };
      document.querySelectorAll("#presetChips .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      reset();
    } catch (e) { $("inErr").textContent = String(e); }
  }
  $("inGo").addEventListener("click", loadInput);
  $("inRegs").addEventListener("keydown", (e) => { if (e.key === "Enter") loadInput(); });

  reset();
})();
