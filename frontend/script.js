
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
    { id: "stop",  asm: "stop",             what: "Halt the program", op: 255, rd: 0, rs1: 0, init: {} },
    { id: "prog", asm: "addi, add, sub", what: "Three instructions in a row", init: {}, program: [
      { rd: 1, rs1: 1, imm: 5, asm: "addi r1, r1, 5" },
      { op: 1, rd: 2, rs1: 1, rs2: 1, asm: "add r2, r1, r1" },
      { op: 2, rd: 3, rs1: 2, rs2: 1, asm: "sub r3, r2, r1" },
    ] },
  ];
  const ISA = [
    [1, "add", "rd", "rs1", "rs2", "r[rd] = r[rs1] + r[rs2]"],
    [2, "sub", "rd", "rs1", "rs2", "r[rd] = r[rs1] - r[rs2]"],
    [3, "ldb", "rd", "base", "offset", "r[rd] = 1 byte at r[base] + offset"],
    [4, "stb", "rs", "base", "offset", "1 byte at r[base] + offset = r[rs]"],
    [5, "addi", "rd", "rs1", "number", "r[rd] = r[rs1] + number"],
    [6, "lw", "rd", "base", "offset", "r[rd] = 4 bytes at r[base] + offset"],
    [7, "sw", "rs", "base", "offset", "4 bytes at r[base] + offset = r[rs]"],
    [8, "bne", "rs1", "rs2", "jump", "if r[rs1] != r[rs2], jump that many instructions"],
    [255, "stop", "—", "—", "—", "halt the program"],
  ];
  const STAGES = ["Fetch", "Decode", "Read", "Execute", "Write back", "Next PC"];
  const MAX_INSTR = 8;

  const CODE = {
    fetch: { file: "emu/emu_cpu.c · run_program()", lines: [
      ["const unsigned char *ins = &program[pc * 4];", true],
      ["int result = execute_instruction(ins[0], ins[1],", true],
      ["                ins[2], ins[3], memory, &pc);", true],
    ]},
    decode: { file: "emu/emu_cpu.c · execute_instruction()", lines: [
      ["int rs2 = byte3;          /* byte 3 as a register (add, sub) */", false],
      ["int imm = (int8_t)byte3;  /* byte 3 as a number, -128 to 127 */", true],
      ["", false],
      ["int dest_bad = (rd < 1 || rd >= NUM_REGS);", true],
      ["int rs1_bad  = (rs1 >= NUM_REGS);", true],
      ["case 5: case 6:  bad = dest_bad || rs1_bad;  break;", true],
    ]},
    read: { file: "emu/emu_cpu.c", lines: [
      ["case 5:   /* addi rd, rs1, imm : r[rd] = r[rs1] + imm */", false],
      ["    addi(rs1, imm, rd);", true],
      ["", false],
      ["void addi(int left, int immediate, int destination) {", false],
      ["    r[destination] = r[left] + (uint32_t)immediate;", true],
      ["}", false],
    ]},
    exec: { file: "emu/emu_cpu.c · addi()", lines: [
      ["void addi(int left, int immediate, int destination) {", false],
      ["    r[destination] = r[left] + (uint32_t)immediate;", true],
      ["}", false],
      ["/* uint32_t math wraps: 0 - 1 = 4294967295 */", false],
    ]},
    write: { file: "emu/emu_cpu.c · addi()", lines: [
      ["void addi(int left, int immediate, int destination) {", false],
      ["    r[destination] = r[left] + (uint32_t)immediate;", true],
      ["}", false],
      ["", false],
      ["print_registers();   /* shows the registers after each instruction */", false],
    ]},
    pc: { file: "emu/emu_cpu.c · execute_instruction()", lines: [
      ["int next_pc = *pc + 1;   /* normally go to the next instruction */", true],
      ["...", false],
      ["*pc = next_pc;           /* move to the next instruction (or the BNE target) */", true],
      ["return stopped;          /* 1 if stop, otherwise 0 */", false],
    ]},
    decodeR: { file: "emu/emu_cpu.c · execute_instruction()", lines: [
      ["int rs2 = byte3;          /* byte 3 as a register (add, sub) */", true],
      ["int rs2_bad = (rs2 >= NUM_REGS);", true],
      ["case 1: case 2:  bad = dest_bad || rs1_bad || rs2_bad;  break;", true],
    ]},
    readR: { file: "emu/emu_cpu.c", lines: [
      ["case 1:   /* add rd, rs1, rs2 : r[rd] = r[rs1] + r[rs2] */", false],
      ["    add(rs1, rs2, rd);", true],
      ["case 2:   /* sub rd, rs1, rs2 : r[rd] = r[rs1] - r[rs2] */", false],
      ["    r[rd] = r[rs1] - r[rs2];", true],
    ]},
    execR: { file: "emu/emu_cpu.c · add() / case 2", lines: [
      ["void add(int left, int right, int destination) {", false],
      ["    r[destination] = r[left] + r[right];", true],
      ["}", false],
      ["/* uint32_t math wraps: 100 - 200 = 4294967196 */", false],
    ]},
    writeR: { file: "emu/emu_cpu.c · add()", lines: [
      ["    r[destination] = r[left] + r[right];", true],
      ["", false],
      ["print_registers();   /* shows the registers after each instruction */", false],
    ]},
    stop: { file: "emu/emu_cpu.c · execute_instruction()", lines: [
      ["case 255:                 /* stop */", false],
      ["    stopped = 1;", true],
      ["    break;", false],
      ["...", false],
      ["return stopped;          /* run_program() ends when this is 1 */", true],
    ]},
    idle: { file: "emu/emu.h", lines: [
      ["#define NUM_REGS  17   /* r[0]..r[16] (r[0] is unused) */", false],
      ["#define MEM_SIZE  256  /* data memory: addresses 0..255 */", false],
      ["", false],
      ["/* Instruction format (4 bytes):", false],
      ["     byte 0 = op     which instruction", true],
      ["     byte 1 = rd     register destination", true],
      ["     byte 2 = rs1    first source register", true],
      ["     byte 3 = byte3  rs2 for add/sub, otherwise imm */", true],
    ]},
  };

  // ---------- parser plug-in (BEGIN) ----------
  const OPS = { add: 1, sub: 2, addi: 5, stop: 255 };
  function normalizeIns(x, i) {
    const where = `Instruction ${i + 1}`;
    let op = typeof x.op === "string" ? OPS[x.op.toLowerCase()]
           : x.op !== undefined ? x.op
           : OPS[String(x.name || x.mnemonic || "addi").toLowerCase()];
    if (![1, 2, 5, 255].includes(op)) throw `${where}: opcode ${x.op ?? x.name} is not animated yet.`;
    const p = { op, rd: x.rd ?? 0, rs1: x.rs1 ?? x.rs ?? 0, rs2: x.rs2 ?? 0, imm: x.imm ?? x.immediate ?? 0 };
    if (op !== 255) {
      const bad = (v, lo) => !Number.isInteger(v) || v < lo || v > 16;
      if (bad(p.rd, 1) || bad(p.rs1, 0) || ((op === 1 || op === 2) && bad(p.rs2, 0))) throw `${where}: register out of range (r1 to r16 for a destination, r0 to r16 for sources).`;
      if (op === 5 && (!Number.isInteger(p.imm) || p.imm < -128 || p.imm > 127)) throw `${where}: the number must fit in one signed byte (-128 to 127).`;
    }
    const nm = { 1: "add", 2: "sub", 5: "addi", 255: "stop" }[op];
    p.asm = x.asm || x.text || (op === 255 ? "stop" : op === 5 ? `addi r${p.rd}, r${p.rs1}, ${p.imm}` : `${nm} r${p.rd}, r${p.rs1}, r${p.rs2}`);
    return p;
  }
  // accepts an array of instructions, or { list | program | instructions, init | regs | registers }
  function normalizeProgram(out) {
    const raw = Array.isArray(out) ? out : (out && (out.list || out.program || out.instructions));
    if (!Array.isArray(raw) || !raw.length) throw "Type at least one instruction.";
    const list = [];
    for (const [i, x] of raw.entries()) { list.push(normalizeIns(x, i)); if (list[i].op === 255) break; }
    const init = (!Array.isArray(out) && (out.init || out.regs || out.registers)) || {};
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
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  // geometry: 8 compact rows that fit inside the 170px program-memory panel (y 56..226)
  const MEM_ROW_TOP = (i) => 60 + i * 19;
  const MEM_ROW_Y = (i) => MEM_ROW_TOP(i) + 8.5;
  const REG_ROW_Y = (i) => 66 + i * 27 + 12;
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
  for (let i = 0; i < 17; i++) {
    const y = 66 + i * 27;
    const r = { rect: el("rect", { class: "cell", x: 736, y, width: 218, height: 24, rx: 4 }, regRows) };
    txt({ class: i === 0 ? "silk-dim" : "silk", x: 746, y: y + 17, style: "font-size:13px" }, "r" + i, regRows);
    r.hex = txt({ class: "val dim", x: 774, y: y + 17, style: "font-size:12px" }, hex8(0), regRows);
    r.dec = txt({ class: "val", x: 944, y: y + 17, "text-anchor": "end", style: "font-size:12px" }, "0", regRows);
    if (i === 0) { r.hex.textContent = "unused"; r.dec.textContent = ""; }
    regs.push(r);
  }

  // traces: static ones built once, register ones rebuilt per instruction
  const path = (d, cls = "trace") => el("path", { d, class: cls }, traces);
  const T = {
    fetch: path(`M250,${MEM_ROW_Y(0)} H278 V94 H316`),
    addr: path("M91,318 V226"),
    pcAdd: path("M146,348 H186"),
    pcBack: path("M206,368 V392 H120 V378"),
    imm: path(`M626,176 V192 H415 V210`),
    sxAlu: path("M415,260 V300"),
    ctrl: path("M356,176 V188 H330 V340 H397", "trace ctrl"),
  };
  T.read = path("M0,0"); T.read2 = path("M0,0"); T.write = path("M0,0");

  // ---------- state ----------
  let preset = PRESETS[0];
  let program = [];
  let R = new Uint32Array(17);
  let pc = 0, stage = 0, busy = false, playing = false, halted = false;

  function setTraceRoutes() {
    const p = program[pc] || program[0];
    const two = p.op === 1 || p.op === 2;
    const ry = REG_ROW_Y(two ? p.rs2 : p.rs1) - 5;
    const wy = REG_ROW_Y(p.rd) + 5;
    T.read2.setAttribute("d", two ? `M736,${REG_ROW_Y(p.rs1) - 5} H712 V292 H415 V300` : "M0,0");
    T.read.setAttribute("d", `M736,${ry} H700 V284 H525 V300`);
    T.write.setAttribute("d", `M470,380 V500 H714 V${wy} H736`);
  }

  function hot(node, on) { node.classList.toggle("hot", on); }
  function clearHot() {
    document.querySelectorAll("#board .hot").forEach((n) => n.classList.remove("hot"));
  }
  // blank the instruction register, sign-extend box and ALU readouts between instructions
  function clearDatapath() {
    packets.textContent = "";
    ir.forEach((c) => { c.byte.textContent = "--"; c.dec.textContent = ""; });
    $("sxVal").textContent = "—";
    $("aluOp").textContent = "idle";
    $("aluA").textContent = "";
    $("aluOut").textContent = "";
  }

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
    return [op, p.rd, p.rs1, (op === 1 || op === 2) ? p.rs2 : p.imm & 0xff];
  }

  function reset() {
    playing = false; halted = false;
    R = new Uint32Array(17);
    for (const k in preset.init) R[k] = preset.init[k];
    pc = 0; stage = 0;
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

    const startNote = Object.keys(preset.init).length
      ? "Starting state: " + Object.entries(preset.init).map(([k, v]) => `r${k} = ${v}`).join(", ") + ". Every other register is 0."
      : "Starting state: every register is 0.";
    showStage(-1, "Ready",
      `The program contains <span class="m">${program.length}</span> instruction${program.length === 1 ? "" : "s"}. ${startNote} Press Play to watch it run, or Step to go one stage at a time.`,
      "idle");
    updateButtons();
  }

  // ---------- narration ----------
  function showStage(i, title, html, codeKey) {
    const lis = $("steps").children;
    for (let k = 0; k < lis.length; k++) lis[k].className = k < i ? "done" : k === i ? "now" : "";
    $("stageTitle").textContent = title;
    $("stageText").innerHTML = html;

    const current = program[pc] || preset;
    const o = current.op || 5;
    let k = codeKey;
    if (o === 255 && !["idle", "fetch", "pc"].includes(k)) k = "stop";
    else if ((o === 1 || o === 2) && CODE[k + "R"]) k += "R";

    const c = CODE[k];
    $("codeFile").textContent = c.file;
    $("code").innerHTML = c.lines.map(([s, h]) => {
      const m = s.match(/^(.*?)(\/\*.*\*\/)?$/);
      const body = esc(m[1] || "") + (m[2] ? `<span class="c">${esc(m[2])}</span>` : "");
      return `<span class="ln${h ? " hl" : ""}">${body || " "}</span>`;
    }).join("");
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
  async function advancePc(narration) {
    showStage(5, "Next PC", narration, "pc");
    hot($("adder"), true);
    await travel(T.pcAdd, String(pc), 600);
    await travel(T.pcBack, String(pc + 1), 800);
    pc += 1;
    $("pcVal").textContent = String(pc);
    if (pc < mem.length) {
      ptr.style.transform = `translateY(${MEM_ROW_Y(pc)}px)`;
      hot(mem[pc].rect, true);
    }
    hot($("adder"), false);
  }

  function stageFns() {
    const p = program[pc], op = p.op || 5, reg2 = op === 1 || op === 2, b = bytesOf(p);
    const name = { 1: "add", 2: "sub", 5: "addi", 255: "stop" }[op], sym = op === 2 ? "−" : "+";
    const a = R[p.rs1], bv = reg2 ? R[p.rs2] : (p.imm >>> 0);
    const result = op === 2 ? (a - bv) >>> 0 : (a + bv) >>> 0;
    const signNote = p.imm < 0
      ? `Byte 3 is <span class="m">0x${hex2(b[3])}</span>. Its top bit is set, so as a signed 8-bit number it means <span class="m">${p.imm}</span>.`
      : `Byte 3 is <span class="m">0x${hex2(b[3])}</span>, which is <span class="m">${p.imm}</span> as a signed 8-bit number.`;
    const wrapNote = a + p.imm < 0
      ? ` Registers are unsigned 32-bit, so going below zero wraps around to <span class="m">${fmt(result)}</span>.`
      : "";

    const fetch = async () => {
      showStage(0, "Fetch", `The program counter holds <span class="m">${pc}</span>, so the CPU reads the 4 bytes at instruction ${pc}: <span class="m">${b.map(hex2).join(" ")}</span>. Every instruction in this CPU is exactly 4 bytes long.`, "fetch");
      hot($("pcCell"), true); hot(mem[pc].rect, true);
      await travel(T.addr, "pc " + pc, 800);
      T.fetch.setAttribute("d", `M250,${MEM_ROW_Y(pc)} H278 V94 H316`);
      await travel(T.fetch, b.map(hex2).join(" "), 1300);
      b.forEach((v, i) => { ir[i].byte.textContent = hex2(v); hot(ir[i].rect, true); });
      hot($("pcCell"), false); hot(mem[pc].rect, false);
      await wait(350);
      ir.forEach((c) => hot(c.rect, false));
    };

    if (op === 255) {
      return [
        fetch,
        async () => { showStage(1, "Decode", `Byte 0 is the opcode: <span class="m">255</span> means <span class="m">stop</span>. Bytes 1 to 3 are not used.`, "decode"); hot(ir[0].rect, true); ir[0].dec.textContent = "STOP"; await wait(900); ir.forEach((c) => hot(c.rect, false)); },
        async () => { showStage(2, "Read", `Stop reads no registers, so nothing travels to the ALU.`, "read"); await wait(900); },
        async () => { showStage(3, "Execute", `Nothing to compute. The CPU only sets <span class="m">stopped = 1</span>.`, "exec"); $("aluOp").textContent = "halt"; hot($("alu"), true); await wait(900); hot($("alu"), false); },
        async () => { showStage(4, "Write back", `Stop writes nothing. Every register keeps its value.`, "write"); await wait(900); },
        () => advancePc(`The pc still moves to <span class="m">${pc} + 1 = ${pc + 1}</span>, but <span class="m">execute_instruction()</span> returned 1, so <span class="m">run_program()</span> ends the program here.`),
      ];
    }

    return [
      fetch,
      async () => {
        showStage(1, "Decode", reg2 ? `Byte 0 is the opcode: <span class="m">${op}</span> means <span class="m">${name}</span>. Byte 1 is the destination <span class="m">r${p.rd}</span>, byte 2 is the first source <span class="m">r${p.rs1}</span>, and byte 3 is the second source <span class="m">r${p.rs2}</span>. For add and sub, byte 3 is a register, not a number, so there is nothing to sign-extend. All three register numbers pass the range check.` : `Byte 0 is the opcode: <span class="m">5</span> means <span class="m">addi</span>. Byte 1 picks the destination register <span class="m">r${p.rd}</span> and byte 2 the source <span class="m">r${p.rs1}</span>. Both pass the range check (r1 to r16 for a destination). ${signNote}`, reg2 ? "decodeR" : "decode");
        hot(ir[0].rect, true); ir[0].dec.textContent = name.toUpperCase(); await wait(450);
        hot(ir[1].rect, true); ir[1].dec.textContent = "r" + p.rd; await wait(350);
        hot(ir[2].rect, true); ir[2].dec.textContent = "r" + p.rs1; await wait(350);
        hot(ir[3].rect, true); ir[3].dec.textContent = reg2 ? "r" + p.rs2 : "imm";
        if (reg2) {
          await travel(T.ctrl, name, 1000);
          $("sxVal").textContent = "not used";
        } else {
          await Promise.all([travel(T.imm, "0x" + hex2(b[3]), 1000), travel(T.ctrl, "add", 1000)]);
          hot($("sxBox"), true);
          $("sxVal").textContent = `0x${hex2(b[3])} → ${p.imm}`;
        }
        $("aluOp").textContent = "op: " + name;
        await wait(400);
        ir.forEach((c) => hot(c.rect, false));
        hot($("sxBox"), false);
      },
      async () => {
        if (reg2) {
          showStage(2, "Read", `The register file sends <span class="m">r${p.rs1}</span>, which holds <span class="m">${fmt(a)}</span>, to ALU input A and <span class="m">r${p.rs2}</span>, which holds <span class="m">${fmt(bv)}</span>, to input B.`, "read");
          hot(regs[p.rs1].rect, true); hot(regs[p.rs2].rect, true);
          await Promise.all([travel(T.read2, fmt(a), 1300), travel(T.read, fmt(bv), 1300)]);
          hot(regs[p.rs1].rect, false); hot(regs[p.rs2].rect, false);
          $("aluA").textContent = `A = ${fmt(a)}  B = ${fmt(bv)}`;
          return;
        }
        showStage(2, "Read", `The register file sends <span class="m">r${p.rs1}</span>, which holds <span class="m">${fmt(a)}</span>, to ALU input A. The sign-extended immediate <span class="m">${p.imm}</span> goes to input B.`, "read");
        hot(regs[p.rs1].rect, true);
        await Promise.all([travel(T.read, fmt(a), 1300), travel(T.sxAlu, String(p.imm), 700)]);
        hot(regs[p.rs1].rect, false);
        $("aluA").textContent = `A = ${fmt(a)}  B = ${p.imm}`;
      },
      async () => {
        if (reg2) {
          const wraps = op === 2 ? a < bv : a + bv > 0xFFFFFFFF;
          showStage(3, "Execute", `The ALU ${op === 2 ? "subtracts" : "adds"} the two inputs: <span class="m">${fmt(a)} ${sym} ${fmt(bv)} = ${fmt(result)}</span>.${wraps ? " Registers are unsigned 32-bit, so the result wraps around." : ""}`, "exec");
          hot($("alu"), true);
          $("aluOp").textContent = `${fmt(a)} ${sym} ${fmt(bv)}`;
          await wait(900);
          $("aluOut").textContent = "= " + fmt(result);
          await wait(500);
          hot($("alu"), false);
          return;
        }
        showStage(3, "Execute", `The ALU adds the two inputs: <span class="m">${fmt(a)} + (${p.imm}) = ${fmt(result)}</span>.${wrapNote}`, "exec");
        hot($("alu"), true);
        $("aluOp").textContent = `${fmt(a)} ${p.imm < 0 ? "−" : "+"} ${Math.abs(p.imm)}`;
        await wait(900);
        $("aluOut").textContent = "= " + fmt(result);
        await wait(500);
        hot($("alu"), false);
      },
      async () => {
        showStage(4, "Write back", `The result goes into <span class="m">r${p.rd}</span>. ${p.rd === p.rs1 ? "Source and destination are the same register, so its old value is replaced." : `r${p.rs1} keeps its value; only r${p.rd} changes.`}`, "write");
        await travel(T.write, fmt(result), 1300);
        R[p.rd] = result; renderRegs();
        hot(regs[p.rd].rect, true); flash(regs[p.rd].rect);
        await wait(700);
        hot(regs[p.rd].rect, false);
      },
      () => {
        const next = program[pc + 1];
        const final = `Final value: <span class="m">r${p.rd} = ${fmt(R[p.rd])}</span>.`;
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
      if (cur.op === 255 || pc >= program.length) {
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
  const soon = $("soonChips");
  const lab = document.createElement("span"); lab.className = "label"; lab.style.alignSelf = "center"; lab.textContent = "Next up:";
  soon.appendChild(lab);
  ["ldb", "stb", "lw", "sw", "bne"].forEach((n) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip soon"; b.disabled = true;
    b.innerHTML = `<span class="asm">${n}</span>`;
    soon.appendChild(b);
  });
  $("steps").innerHTML = STAGES.map((s) => `<li>${s}</li>`).join("");
  $("isaBody").innerHTML = ISA.map(([op, n, a, bb, c, d]) =>
    `<tr><td class="mono">${op}</td><td class="mono"><b>${n}</b></td><td class="mono">${a}</td><td class="mono">${bb}</td><td class="mono">${c}</td><td>${d}</td><td><span class="pill${["addi", "add", "sub", "stop"].includes(n) ? " live" : ""}">${["addi", "add", "sub", "stop"].includes(n) ? "animated" : "next"}</span></td></tr>`
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