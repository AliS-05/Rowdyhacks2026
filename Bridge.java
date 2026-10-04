/*
 * Bridge.java - connects the front end to the assembler and the CPU emulator.
 *
 *   page ("Load it") --JSON--> Bridge --program.s--> assembler --machine code--> emulator (the CPU)
 *   page (the board) <--JSON-- Bridge <------ cpu_json_output.json, written by the emulator
 *
 * It uses only what ships with Java (no libraries):
 *   - com.sun.net.httpserver  to serve the page and receive its requests
 *   - ProcessBuilder          to run the assembler and the emulator
 *   - the Json class below    a small hand-written JSON parser and writer
 *
 * HOW THE PAGE GETS CONNECTED WITHOUT CHANGING IT
 *   script.js already asks a "parser" for the program whenever Load it is pressed:
 *   it calls window.parseProgram(text, regsText), a function that parser.js defines.
 *   When the page is opened THROUGH THE BRIDGE, the bridge answers the request for
 *   parser.js with its own version (see connectorScript below). That version sends
 *   the text to the bridge, and returns what the CPU reported. index.html, script.js
 *   and the parser.js file on disk are all left as they are.
 *
 * Run it from the repo's top folder (needs Java 11 or newer, no compile step):
 *   java Bridge.java                 starts the bridge and opens the page in the browser
 *   java Bridge.java 9000            same, on another port
 *   java Bridge.java --install       writes the bridge's parser.js into the page's folder,
 *                                    then starts the bridge (for use with Live Server)
 *   java Bridge.java --build         compiles the assembler and the emulator for THIS computer
 *                                    with gcc, then starts the bridge (options can be combined)
 *   java Bridge.java --file goal.s   no server: run one file and print the JSON reply
 *
 * The assembler and emulator are C programs, and a C program only runs on the kind of
 * computer it was compiled on. An "assemblr" file built on Linux or macOS cannot run on
 * Windows (the error says "not a valid Win32 application"); --build makes assemblr.exe
 * and emulator.exe from src/*.c and emu/*.c.
 *
 * THE BRIDGE MUST STAY RUNNING while the page is used: leave its terminal window open.
 * If the page says "Could not reach the bridge", this program is not running.
 * To check, open http://127.0.0.1:8080/run in a browser tab: a running bridge answers
 * with a line of JSON.
 *
 * Use the page at the bridge's address (http://127.0.0.1:8080/). VS Code's Live Server
 * hands out whatever parser.js is on disk instead, so for Live Server start the bridge
 * with --install: the parser.js it writes reaches the bridge from any address.
 *
 * Where things are (defaults shown; change with environment variables):
 *   ASSEMBLER=./assemblr
 *   EMULATOR=./emulator              (not ./emu: the repo already has a folder called emu)
 *   FRONTEND=<folder>                folder with index.html; found automatically if not set
 *   EMU_JSON=cpu_json_output.json    the file the emulator writes its JSON to
 *   ASM_OUTPUT=<file name>           only if the assembler writes several files
 *
 * The page sends:      POST /run   {"source": "addi r1, r1, 5\n...", "registers": "r1=100, r2=200"}
 * The bridge replies:  {"ok": true, "instructions": [...], "init": {...}, "assembler": {...}, "emulator": {...}}
 *                 or:  {"ok": false, "stage": "assembler", "error": "..."}
 */
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.awt.Desktop;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class Bridge {

    /* ---------------- Settings ---------------- */
    static final int  DEFAULT_PORT   = 8080;             // port the bridge listens on (NOT the page's port)
    static final int  MAX_SOURCE     = 64 * 1024;        // longest program text accepted (characters)
    static final int  MAX_OUTPUT     = 4 * 1024 * 1024;  // most output kept from one tool (bytes)
    static final int  MAX_RAW_REPLY  = 20000;            // most non-JSON emulator text sent back (characters)
    static final long ASM_TIMEOUT_MS = 5000;             // assembler is killed after this long
    static final long EMU_TIMEOUT_MS = 5000;             // emulator is killed after this long (infinite loops)

    static Path assembler;                               // full path of the assembler program
    static Path emulator;                                // full path of the emulator program
    static Path frontend;                                // full path of the folder with index.html
    static String emuJsonName;                           // file the emulator writes its JSON to
    static int port;                                     // port the bridge is listening on

    /* ======================= START-UP ======================= */

    public static void main(String[] args) throws Exception {
        // Options, in any order:  --install  --build  --file <name>  <port number>
        boolean install = false, build = false;
        String fileToRun = null;
        String envPort = System.getenv("PORT");
        port = envPort != null ? Integer.parseInt(envPort) : DEFAULT_PORT;
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--install")) install = true;
            else if (args[i].equals("--build")) build = true;
            else if (args[i].equals("--file") && i + 1 < args.length) fileToRun = args[++i];
            else if (args[i].matches("\\d{1,5}")) port = Integer.parseInt(args[i]);
            else {
                System.out.println("Unknown option: " + args[i]);
                System.out.println("Usage: java Bridge.java [--build] [--install] [port]   or   --file program.s");
                return;
            }
        }

        if (build) buildTools();                             // before looking for the programs it makes

        assembler = toolPath("ASSEMBLER", "./assemblr");
        emulator  = toolPath("EMULATOR",  "./emulator");
        frontend  = findFrontend();
        emuJsonName = System.getenv("EMU_JSON") != null ? System.getenv("EMU_JSON") : "cpu_json_output.json";

        // Test mode: run one assembly file through the pipeline and print the reply.
        if (fileToRun != null) {
            String source = new String(Files.readAllBytes(Paths.get(fileToRun)), StandardCharsets.UTF_8);
            // print as UTF-8 whatever the terminal's default encoding is
            new PrintStream(System.out, true, "UTF-8").println(Json.write(runPipeline(source, "")));
            return;
        }

        // 127.0.0.1 = only programs on this computer can connect.
        // Use new InetSocketAddress(port) instead to accept other machines on the network.
        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        } catch (BindException e) {
            System.out.println("Port " + port + " is already used by another program, so the bridge cannot start.");
            System.out.println("Is another copy of the bridge still running? Otherwise start it on a free port:");
            System.out.println("    java Bridge.java 9000");
            System.exit(1);
            return;
        }
        server.createContext("/run", Bridge::handleRun);            // POST /run goes to handleRun
        server.createContext("/", Bridge::handleFile);              // everything else: the front end's files
        server.setExecutor(Executors.newFixedThreadPool(4));        // up to 4 requests at the same time
        server.start();

        System.out.println("Bridge is running. LEAVE THIS WINDOW OPEN: the page only works while it runs.");
        if (Files.isRegularFile(frontend.resolve("index.html"))) {
            String address = "http://127.0.0.1:" + port + "/";
            boolean onDisk = install ? installConnector() : refreshConnector();
            if (onDisk) {
                System.out.println("  parser.js:  written to " + frontend.resolve("parser.js"));
                System.out.println("  Open the page with Live Server as usual, or at " + address);
            } else {
                System.out.println("  USE THE PAGE AT THIS ADDRESS:  " + address);
                System.out.println("  (at any other address the page gets no parser and says \"No parser loaded\")");
                System.out.println("  parser.js:  supplied by the bridge, so \"Load it\" runs the assembler and the CPU");
                openBrowser(address);
            }
            System.out.println("  page files: " + frontend);
        } else {
            System.out.println("  PROBLEM: no index.html found, so the bridge cannot show the page.");
            System.out.println("  Start it again with FRONTEND set to the folder that holds index.html.");
        }
        System.out.println("  assembler:  " + assembler + startupNote(assembler));
        System.out.println("  emulator:   " + emulator  + startupNote(emulator));
        if (toolProblem(assembler) != null || toolProblem(emulator) != null) {
            System.out.println("  To fix a PROBLEM above: " + BUILD_HINT);
        }
    }

    /* Opens the page in the default browser, so it is at the right address from the start. */
    static void openBrowser(String address) {
        if (System.getenv("BRIDGE_NO_BROWSER") != null) return;
        try {
            if (Desktop.isDesktopSupported() && Desktop.getDesktop().isSupported(Desktop.Action.BROWSE)) {
                Desktop.getDesktop().browse(URI.create(address));
                return;
            }
        } catch (Throwable noDesktop) {
            // fall through to the operating system's own "open this" command
        }
        String os = System.getProperty("os.name", "").toLowerCase();
        String[] command = os.contains("win") ? new String[] {"rundll32", "url.dll,FileProtocolHandler", address}
                         : os.contains("mac") ? new String[] {"open", address}
                         : new String[] {"xdg-open", address};
        try {
            new ProcessBuilder(command).start();
        } catch (IOException noBrowser) {
            // no way to open a browser from here: the address printed above still works
        }
    }

    /*
     * --install: writes the bridge's parser.js into the page's folder, so the page reaches
     * the bridge however it is opened (Live Server, double-clicking index.html, ...).
     * A parser.js that someone else wrote is never overwritten.
     * Returns true if the bridge's parser.js is on disk afterwards.
     */
    static boolean installConnector() throws IOException {
        Path file = frontend.resolve("parser.js");
        if (Files.exists(file) && !writtenByBridge(file)) {
            System.out.println("  NOT INSTALLED: " + file + " already exists and was not written by the bridge.");
            System.out.println("  Rename it (for example to parser.old.js) and run --install again.");
            return false;
        }
        Files.write(file, connectorScript().getBytes(StandardCharsets.UTF_8));
        return true;
    }

    /* If an earlier --install left the bridge's parser.js on disk, rewrite it so it has today's port. */
    static boolean refreshConnector() throws IOException {
        Path file = frontend.resolve("parser.js");
        if (!Files.exists(file) || !writtenByBridge(file)) return false;
        Files.write(file, connectorScript().getBytes(StandardCharsets.UTF_8));
        return true;
    }

    static boolean writtenByBridge(Path file) throws IOException {
        return new String(Files.readAllBytes(file), StandardCharsets.UTF_8).contains(CONNECTOR_MARK);
    }

    /*
     * Finds the folder that holds the page (index.html): the FRONTEND setting if there
     * is one, else a likely folder next to where the bridge was started.
     */
    static Path findFrontend() {
        String value = System.getenv("FRONTEND");
        if (value != null) return Paths.get(value).toAbsolutePath().normalize();

        Path here = Paths.get("").toAbsolutePath().normalize();
        for (String name : new String[] {"frontend", "front-end", "web", "site", "public", "docs", "."}) {
            Path dir = here.resolve(name).normalize();
            if (Files.isRegularFile(dir.resolve("index.html"))) return dir;
        }
        // otherwise the nearest folder below this one, up to three levels down, that has index.html
        try (Stream<Path> walk = Files.walk(here, 3)) {
            Path best = null;
            for (Path dir : (Iterable<Path>) walk::iterator) {
                String relative = here.relativize(dir).toString();
                boolean skip = relative.startsWith(".") || relative.contains("/.") || relative.contains("\\.")
                        || relative.contains("node_modules");
                if (skip || !Files.isDirectory(dir) || !Files.isRegularFile(dir.resolve("index.html"))) continue;
                if (best == null || dir.getNameCount() < best.getNameCount()) best = dir;
            }
            if (best != null) return best;
        } catch (IOException | RuntimeException ignored) {
            // cannot look through the folders: fall through to the default
        }
        return here.resolve("frontend");
    }

    static final String BUILD_HINT =
            "stop the bridge and start it with   java Bridge.java --build   (compiles the C code with gcc)";

    static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase().startsWith("windows");
    }

    /* The kind of computer this is, in the words builtFor() uses. */
    static String thisSystem() {
        String os = System.getProperty("os.name", "").toLowerCase();
        return os.startsWith("windows") ? "Windows" : os.contains("mac") ? "macOS" : "Linux";
    }

    /* Reads a tool's location from an environment variable, or uses the default. */
    static Path toolPath(String envName, String defaultPath) {
        String value = System.getenv(envName);
        // Absolute, because the tools are run from a temporary folder, not from here.
        Path path = Paths.get(value != null ? value : defaultPath).toAbsolutePath().normalize();
        Path exe = Paths.get(path + ".exe");                // on Windows, programs are called name.exe
        // On Windows name.exe wins even if a file called just "name" exists: that one is
        // usually a Linux or macOS build that came with the repo.
        if (isWindows() && Files.isRegularFile(exe)) return exe;
        if (!Files.isRegularFile(path) && Files.isRegularFile(exe)) return exe;
        return path;
    }

    /*
     * Which kind of computer a program file was compiled for: "Windows", "Linux" or "macOS".
     * Every compiled program starts with a few fixed bytes that say so. Returns null for
     * anything else (a script, for example).
     */
    static String builtFor(Path file) {
        byte[] b;
        try (InputStream in = Files.newInputStream(file)) {
            b = in.readNBytes(4);
        } catch (IOException e) {
            return null;
        }
        if (b.length < 4) return null;
        if (b[0] == 'M' && b[1] == 'Z') return "Windows";                                // .exe files
        if (b[0] == 0x7F && b[1] == 'E' && b[2] == 'L' && b[3] == 'F') return "Linux";   // ELF files
        int first = ((b[0] & 0xFF) << 24) | ((b[1] & 0xFF) << 16) | ((b[2] & 0xFF) << 8) | (b[3] & 0xFF);
        if (first == 0xFEEDFACE || first == 0xFEEDFACF || first == 0xCEFAEDFE
                || first == 0xCFFAEDFE || first == 0xCAFEBABE) return "macOS";           // Mach-O files
        return null;
    }

    /* Says what is wrong with a tool's path, or returns null if it can be run. */
    static String toolProblem(Path tool) {
        if (Files.isDirectory(tool))    return "is a folder, not a program";
        if (!Files.isRegularFile(tool)) return "was not found";
        String madeFor = builtFor(tool);
        if (madeFor != null && !madeFor.equals(thisSystem())) {
            return "was built for " + madeFor + ", so " + thisSystem() + " cannot run it";
        }
        if (!Files.isExecutable(tool))  return "is not allowed to run (try: chmod +x)";
        return null;
    }

    /* ======================= --build: COMPILING THE C PROGRAMS ======================= */

    /*
     * Compiles the two C programs for this computer:
     *   assembler  from every .c file in src/   (the same recipe as the repo's Makefile)
     *   emulator   from every .c file in emu/
     * On Windows the results are assemblr.exe and emulator.exe; the "assemblr" file that
     * came with the repo is left alone. Uses gcc, or whatever the CC setting names.
     */
    static void buildTools() throws InterruptedException {
        String compiler = System.getenv("CC") != null ? System.getenv("CC") : "gcc";
        String ending = isWindows() ? ".exe" : "";
        System.out.println("Building the C programs with " + compiler + " ...");
        boolean haveCompiler = compile(compiler, "src", "assemblr" + ending, "-Wall", "-Wextra", "-O2");
        if (haveCompiler) compile(compiler, "emu", "emulator" + ending, "-Wall");
        System.out.println();
    }

    /* Compiles one program. Returns false only if the compiler itself could not be run. */
    static boolean compile(String compiler, String folder, String output, String... flags) throws InterruptedException {
        Path here = Paths.get("").toAbsolutePath();
        List<String> sources = new ArrayList<>();
        try (DirectoryStream<Path> files = Files.newDirectoryStream(here.resolve(folder), "*.c")) {
            for (Path file : files) sources.add(folder + "/" + file.getFileName());
        } catch (IOException e) {
            // no such folder: handled just below, like a folder with no .c files
        }
        Collections.sort(sources);
        if (sources.isEmpty()) {
            System.out.println("  " + output + ": NOT BUILT, there are no .c files in " + here.resolve(folder));
            return true;
        }

        List<String> command = new ArrayList<>();
        command.add(compiler);
        command.addAll(Arrays.asList(flags));
        command.addAll(Arrays.asList("-Iinclude", "-Iemu", "-o", output));
        command.addAll(sources);
        System.out.println("  " + String.join(" ", command));
        try {
            Process process = new ProcessBuilder(command).directory(here.toFile()).inheritIO().start();
            int exitCode = process.waitFor();               // the compiler's own messages appear in this window
            System.out.println(exitCode == 0 ? "  " + output + ": built"
                                             : "  " + output + ": NOT BUILT, the compiler reported errors (above)");
            return true;
        } catch (IOException e) {
            System.out.println("  NOTHING BUILT: could not run \"" + compiler + "\".");
            System.out.println("  A C compiler has to be installed and on the PATH. On Windows, install");
            System.out.println("  MSYS2 or WinLibs (both give you gcc), open a NEW terminal, and try again.");
            return false;
        }
    }

    static String startupNote(Path tool) {
        String problem = toolProblem(tool);
        return problem == null ? "" : "   <-- PROBLEM: it " + problem;
    }

    /* ======================= THE HTTP SIDE ======================= */

    /* Called once for every request to /run. */
    static void handleRun(HttpExchange exchange) throws IOException {
        try {
            // CORS: lets a web page served from a different port call this server.
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "POST, OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            // asked for by some browsers when a page on the network calls a program on this computer
            exchange.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");

            String method = exchange.getRequestMethod();
            if (method.equals("OPTIONS")) {                 // the browser's "may I?" request before a POST
                exchange.sendResponseHeaders(204, -1);      // 204 = yes, and no body
                return;
            }
            if (method.equals("GET")) {                     // someone opened the address in a browser tab
                Map<String, Object> status = new LinkedHashMap<>();
                status.put("ok", true);
                status.put("bridge", "running");
                status.put("assembler", toolProblem(assembler) == null ? "ready" : "PROBLEM: it " + toolProblem(assembler));
                status.put("emulator", toolProblem(emulator) == null ? "ready" : "PROBLEM: it " + toolProblem(emulator));
                send(exchange, 200, status);
                return;
            }
            if (!method.equals("POST")) {
                send(exchange, 405, failure("request", "use POST with a JSON body"));
                return;
            }

            // Read the body, refusing anything unreasonably large.
            byte[] body = readLimited(exchange.getRequestBody(), MAX_SOURCE * 4);
            if (body == null) {
                send(exchange, 413, failure("request", "request body is too large"));
                return;
            }

            // Parse the front end's JSON and pull out the "source" string.
            Object request;
            try {
                request = Json.parse(new String(body, StandardCharsets.UTF_8));
            } catch (Json.ParseException e) {
                send(exchange, 400, failure("request", "request is not valid JSON: " + e.getMessage()));
                return;
            }
            Object source = (request instanceof Map) ? ((Map<?, ?>) request).get("source") : null;
            if (!(source instanceof String)) {
                send(exchange, 400, failure("request", "expected a JSON object with a string field \"source\""));
                return;
            }

            // "registers" is the page's Starting registers box, for example "r1=100, r2=200".
            Object registers = ((Map<?, ?>) request).get("registers");
            String registersText = (registers instanceof String) ? (String) registers : "";

            // Do the work. Assembly errors are a normal outcome, so they still get status 200;
            // the front end looks at "ok" and "stage" to see what happened.
            Map<String, Object> reply = runPipeline((String) source, registersText);
            logRun((String) source, reply);
            send(exchange, 200, reply);

        } catch (Exception e) {                             // anything unexpected: report it, don't crash
            send(exchange, 500, failure("bridge", e.toString()));
        } finally {
            exchange.close();
        }
    }

    /*
     * Writes what happened in one run to the terminal, in full. The page only has room
     * for a sentence; this is where to look (and what to copy) when something fails.
     */
    static synchronized void logRun(String source, Map<String, Object> reply) {
        StringBuilder log = new StringBuilder();
        log.append("\n==================== a program was sent from the page ====================\n");
        log.append("program:\n").append(indent(source));
        Object asm = reply.get("assembler"), emu = reply.get("emulator");
        if (asm instanceof Map) {
            Map<?, ?> a = (Map<?, ?>) asm;
            log.append("ASSEMBLER  exit code ").append(a.get("exit_code")).append("\n");
            if (a.get("output_from") != null) {
                log.append("  its output, handed to the emulator: ").append(a.get("output_from"))
                   .append(", ").append(a.get("output_bytes")).append(" bytes\n");
                log.append("  that output starts with:\n").append(indent(String.valueOf(a.get("output_preview"))));
            }
            logPrinted(log, "  it printed:", a.get("stdout"), a.get("stderr"));
        }
        if (emu instanceof Map) {
            Map<?, ?> e = (Map<?, ?>) emu;
            log.append("EMULATOR  exit code ").append(e.get("exit_code")).append("\n");
            logPrinted(log, "  it printed:", e.get("raw"), e.get("stderr"));
            int values = (e.get("cycles") instanceof List) ? ((List<?>) e.get("cycles")).size() : 0;
            boolean fromFile = String.valueOf(e.get("json_from")).startsWith("file");
            if (!fromFile && !Boolean.TRUE.equals(e.get("is_json"))) {
                log.append("  its JSON: none (it wrote no ").append(emuJsonName).append(", and what it printed is not JSON)\n");
            } else {
                log.append("  its JSON (").append(e.get("json_from")).append("): ");
                log.append(Boolean.TRUE.equals(e.get("is_json")) ? values + " value(s) read" : "NOT VALID, " + e.get("json_error"));
                log.append("\n");
            }
            if (e.get("json_text") != null) log.append(indent(String.valueOf(e.get("json_text"))));
            if (values > 0) {
                String first = Json.write(((List<?>) e.get("cycles")).get(0));
                log.append("  the first value in it:\n").append(indent(first.length() > 700 ? first.substring(0, 700) + " ..." : first));
            }
            if (e.get("note") != null) log.append("  note: ").append(e.get("note")).append("\n");
        }
        if (Boolean.TRUE.equals(reply.get("ok"))) {
            int count = (reply.get("instructions") instanceof List) ? ((List<?>) reply.get("instructions")).size() : 0;
            log.append("RESULT  ok, ").append(count).append(" instruction(s) sent to the page, taken from ")
               .append(reply.get("instructions_from")).append("\n");
            for (Object one : (List<?>) reply.get("instructions")) {
                if (one instanceof Map) log.append("    ").append(((Map<?, ?>) one).get("asm")).append("\n");
            }
        } else {
            log.append("RESULT  STOPPED at the ").append(reply.get("stage")).append(" stage: ")
               .append(reply.get("error")).append("\n");
        }
        log.append("===========================================================================");
        System.out.println(log);
    }

    static void logPrinted(StringBuilder log, String title, Object first, Object second) {
        String text = ((first instanceof String ? (String) first : "") + (second instanceof String ? (String) second : "")).trim();
        log.append(title).append(text.isEmpty() ? " (nothing)\n" : "\n" + indent(text));
    }

    /* Each line of the text moved four spaces in, and the whole kept to a readable length. */
    static String indent(String text) {
        if (text.length() > 3000) text = text.substring(0, 3000) + "\n... (cut here; there was more)";
        StringBuilder out = new StringBuilder();
        for (String line : text.split("\\r?\\n", -1)) out.append("    ").append(line).append("\n");
        return out.toString();
    }

    /*
     * The start of a file in a form a person can read: as text if it is text,
     * otherwise as the numbers of its bytes (two hex digits each).
     */
    static String preview(byte[] start) {
        int odd = 0;
        for (byte b : start) {
            if ((b < 0x20 && b != '\n' && b != '\r' && b != '\t') || b == 0x7F) odd++;
        }
        if (start.length > 0 && odd == 0) return "(text) " + new String(start, StandardCharsets.UTF_8);
        StringBuilder hex = new StringBuilder("(bytes, in hex) ");
        for (int k = 0; k < Math.min(start.length, 48); k++) hex.append(String.format("%02x ", start[k] & 0xFF));
        if (start.length > 48) hex.append("...");
        return hex.toString().trim();
    }

    /* Sends a JSON reply. */
    static void send(HttpExchange exchange, int status, Map<String, Object> reply) throws IOException {
        byte[] bytes = Json.write(reply).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    /* Reads a whole stream, or returns null if it is longer than limit bytes. */
    static byte[] readLimited(InputStream in, int limit) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) != -1) {
            if (buffer.size() + n > limit) return null;
            buffer.write(chunk, 0, n);
        }
        return buffer.toByteArray();
    }

    /* Builds a reply that says "this went wrong, at this stage". */
    static Map<String, Object> failure(String stage, String message) {
        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("ok", false);
        reply.put("stage", stage);
        reply.put("error", message);
        return reply;
    }

    /* ======================= THE FRONT END'S FILES ======================= */

    /*
     * Called for every request that is not /run. Hands out the files in the FRONTEND
     * folder, so the page and the bridge share one address and the browser has no
     * cross-origin rules to apply.
     */
    static void handleFile(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();       // for example "/script.js"
            if (path.equals("/")) path = "/index.html";

            // parser.js is the one file the bridge does not read from disk: it sends its own
            // version, which is what connects the page's Load it button to the bridge.
            // (Whatever folder the page asks for it in: /parser.js, /site/parser.js, ...)
            if (path.endsWith("/parser.js") && exchange.getRequestMethod().equals("GET")) {
                byte[] script = connectorScript().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/javascript; charset=utf-8");
                exchange.getResponseHeaders().set("Cache-Control", "no-store");
                exchange.sendResponseHeaders(200, script.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(script);
                }
                return;
            }

            Path file = null;
            try {
                // normalize() works out any ".." in the path, so the check below can
                // tell when the result has left the front end folder.
                file = frontend.resolve(path.substring(1)).normalize();
            } catch (InvalidPathException badName) {
                // a name the file system cannot have: treated as "not found" below
            }

            boolean allowed = file != null
                    && exchange.getRequestMethod().equals("GET")
                    && file.startsWith(frontend)                    // never anything outside the folder
                    && !path.contains("/.")                         // no hidden files such as .git
                    && Files.isRegularFile(file);

            byte[] body;
            if (allowed) {
                body = Files.readAllBytes(file);
                exchange.getResponseHeaders().set("Content-Type", contentType(file.getFileName().toString()));
                exchange.getResponseHeaders().set("Cache-Control", "no-store");    // always the newest file
                exchange.sendResponseHeaders(200, body.length);
            } else {
                body = "Not found\n".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
                exchange.sendResponseHeaders(404, body.length);
            }
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(body);
            }
        } finally {
            exchange.close();
        }
    }

    /*
     * The parser.js the bridge hands to the page. It is JavaScript, kept here as text.
     *
     * script.js calls window.parseProgram(text, regsText) when Load it is pressed and
     * expects the program back straight away, so the request is made in the "wait for
     * the answer" style (the false in xhr.open). Whatever is thrown is shown on the page
     * in red under the Load it button.
     */
    static final String CONNECTOR_MARK = "parser.js - written by Bridge.java";

    static String connectorScript() {
        return String.join("\n",
            "/* " + CONNECTOR_MARK + ".",
            "   When Load it is pressed, script.js calls window.parseProgram. This version sends the",
            "   program to the bridge, which runs the assembler and the CPU and returns the result. */",
            "(function () {",
            "  var PORT = " + port + ";",
            "",
            "  // The bridge is tried at each of these in turn. The last one is this page's own",
            "  // address, which is the right one when the page was opened through the bridge.",
            "  var ADDRESSES = ['http://127.0.0.1:' + PORT + '/run', 'http://localhost:' + PORT + '/run'];",
            "  var own = /^https?:$/.test(location.protocol) ? location.origin + '/run' : null;",
            "  if (own && ADDRESSES.indexOf(own) < 0) ADDRESSES.push(own);",
            "",
            "  // Sends the request to one address. Returns the bridge's reply, or null if the",
            "  // bridge is not at that address (nothing answered, or something else did).",
            "  function ask(address, body) {",
            "    try {",
            "      var xhr = new XMLHttpRequest();",
            "      xhr.open('POST', address, false);                  // false = wait here for the answer",
            "      xhr.setRequestHeader('Content-Type', 'application/json');",
            "      xhr.send(body);",
            "      var reply = JSON.parse(xhr.responseText);",
            "      return (reply && typeof reply.ok === 'boolean') ? reply : null;",
            "    } catch (e) {",
            "      return null;",
            "    }",
            "  }",
            "",
            "  window.parseProgram = function (text, regsText) {",
            "    var body = JSON.stringify({ source: text, registers: regsText });",
            "    for (var i = 0; i < ADDRESSES.length; i++) {",
            "      var reply = ask(ADDRESSES[i], body);",
            "      if (reply) {",
            "        if (!reply.ok) throw explain(reply);",
            "        return reply;                                    // script.js uses reply.instructions and reply.init",
            "      }",
            "    }",
            "    throw 'Could not reach the bridge. It has to be running: in a terminal, run   java Bridge.java   ' +",
            "          'and leave that window open. To check, open ' + ADDRESSES[0] + ' in a new tab; ' +",
            "          'a running bridge answers with a line of JSON.';",
            "  };",
            "",
            "  // says where it stopped, plus what the assembler or CPU printed",
            "  function explain(reply) {",
            "    var error = reply.error || 'no reason given';",
            "    if (reply.stage === 'request') return error;         // a problem with what was typed",
            "    var stage = reply.stage || 'bridge';",
            "    var text = 'Stopped at the ' + stage + ' stage: ' + error + '.';",
            "    var asm = reply.assembler || {}, emu = reply.emulator || {};",
            "    // what the program that failed printed; error messages are at the end, so keep the end",
            "    var said = (stage === 'emulator' ? [emu.raw, emu.stderr] : [asm.stdout, asm.stderr]);",
            "    said = said.filter(Boolean).join(' ').trim();",
            "    if (said.length > 400) said = '... ' + said.slice(-400);",
            "    text += said ? ' The ' + stage + ' printed: ' + said : ' The ' + stage + ' printed nothing.';",
            "    if (stage === 'emulator' && asm.output_from) {",
            "      text += ' (It was given the assembler output: ' + asm.output_from + ', ' + asm.output_bytes + ' bytes.)';",
            "    }",
            "    return text + ' The full details are in the terminal window where the bridge is running.';",
            "  }",
            "})();",
            "");
    }

    /* Tells the browser what kind of file it is getting, from the file's ending. */
    static String contentType(String name) {
        String ending = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
        switch (ending) {
            case "html": return "text/html; charset=utf-8";
            case "css":  return "text/css; charset=utf-8";
            case "js":   return "text/javascript; charset=utf-8";
            case "json": return "application/json; charset=utf-8";
            case "svg":  return "image/svg+xml";
            case "png":  return "image/png";
            case "jpg":
            case "jpeg": return "image/jpeg";
            case "ico":  return "image/x-icon";
            default:     return "application/octet-stream";
        }
    }

    /* ======================= THE PIPELINE ======================= */

    /*
     * source text -> assembler -> emulator (the CPU) -> reply.
     * Every request gets its own temporary folder, so two requests never mix up their files.
     */
    static Map<String, Object> runPipeline(String source, String registersText)
            throws IOException, InterruptedException {
        if (source.length() > MAX_SOURCE) return failure("request", "The program is too long.");
        if (source.trim().isEmpty()) return failure("request", "Type at least one instruction.");

        // The starting registers are for the page's board only; the CPU itself starts at zero.
        Map<String, Object> init;
        try {
            init = parseRegisters(registersText);
        } catch (IllegalArgumentException e) {
            return failure("request", e.getMessage());
        }

        Map<String, Object> reply = new LinkedHashMap<>();
        reply.put("ok", false);                             // placeholders, so these come first in the reply
        reply.put("stage", "assembler");

        Path dir = Files.createTempDirectory("bridge-");
        try {
            /* 1. Put the program text in a file, because the assembler takes a file name. */
            Path sourceFile = dir.resolve("program.s");
            Files.write(sourceFile, source.getBytes(StandardCharsets.UTF_8));

            /* 2. Run the assembler:  assemblr program.s */
            if (toolProblem(assembler) != null) {
                reply.put("error", "the assembler program " + assembler + " " + toolProblem(assembler)
                        + ". To fix it, " + BUILD_HINT);
                return reply;
            }
            ToolResult asm;
            try {
                asm = runTool(Arrays.asList(assembler.toString(), "program.s"), dir, ASM_TIMEOUT_MS);
            } catch (IOException e) {
                reply.put("error", "could not start the assembler (" + assembler + "): " + e.getMessage()
                        + ". If it was built on another kind of computer, " + BUILD_HINT);
                return reply;
            }
            Map<String, Object> asmInfo = new LinkedHashMap<>();
            asmInfo.put("exit_code", asm.exitCode);
            asmInfo.put("stdout", text(asm.stdout));
            asmInfo.put("stderr", text(asm.stderr));
            reply.put("assembler", asmInfo);

            if (asm.timedOut)      { reply.put("error", "assembler took too long and was stopped"); return reply; }
            if (asm.exitCode != 0) { reply.put("error", "assembler failed with exit code " + asm.exitCode); return reply; }

            /* 3. Find the machine code the assembler produced.
             *    The folder held only program.s, so any other file in it now is the assembler's output.
             *    If it made no file, whatever it printed is taken to be the machine code. */
            Path machineCode;
            String wanted = System.getenv("ASM_OUTPUT");
            List<Path> created = newFiles(dir, sourceFile);
            if (wanted != null) {
                machineCode = dir.resolve(wanted);
                if (!Files.isRegularFile(machineCode)) {
                    reply.put("error", "assembler did not create " + wanted);
                    return reply;
                }
                asmInfo.put("output_from", "file " + wanted);
            } else if (created.size() == 1) {
                machineCode = created.get(0);
                asmInfo.put("output_from", "file " + machineCode.getFileName());
            } else if (created.size() > 1) {
                reply.put("error", "assembler created several files " + fileNames(created)
                        + "; set ASM_OUTPUT to the one the emulator should read");
                return reply;
            } else if (asm.stdout.length > 0) {
                machineCode = dir.resolve("program.bin");
                Files.write(machineCode, asm.stdout);
                asmInfo.put("output_from", "stdout");
                // binary machine code is not a message, so it is left out of the reply;
                // JSON text is readable, so it stays
                if (tryJson(text(asm.stdout)) == null) asmInfo.remove("stdout");
            } else {
                reply.put("error", "assembler produced no output");
                return reply;
            }
            asmInfo.put("output_bytes", Files.size(machineCode));
            asmInfo.put("output_preview", preview(readStart(machineCode, 600)));

            /*    If the assembler printed JSON, or the file it wrote is JSON (a listing of the
             *    program, say), the front end gets it ready-parsed as "json" in the reply. */
            Object asmJson = tryJson(text(asm.stdout));
            if (asmJson == null && Files.size(machineCode) <= MAX_OUTPUT) {
                asmJson = tryJson(text(Files.readAllBytes(machineCode)));
            }
            if (asmJson != null) asmInfo.put("json", asmJson);

            /* 4. Run the emulator on that file:  emulator <file>
             *    It runs inside our temporary folder, so that is where its JSON file appears. */
            reply.put("stage", "emulator");
            if (toolProblem(emulator) != null) {
                reply.put("error", "the emulator program " + emulator + " " + toolProblem(emulator)
                        + ". To fix it, " + BUILD_HINT);
                return reply;
            }
            ToolResult emu;
            try {
                emu = runTool(Arrays.asList(emulator.toString(), machineCode.getFileName().toString()),
                              dir, EMU_TIMEOUT_MS);
            } catch (IOException e) {
                reply.put("error", "could not start the emulator (" + emulator + "): " + e.getMessage()
                        + ". If it was built on another kind of computer, " + BUILD_HINT);
                return reply;
            }
            Map<String, Object> emuInfo = new LinkedHashMap<>();
            emuInfo.put("exit_code", emu.exitCode);
            emuInfo.put("stderr", text(emu.stderr));
            reply.put("emulator", emuInfo);

            /* 5. Collect the emulator's JSON.
             *    The emulator writes it to a file (cpu_json_output.json) in the folder it runs in.
             *    If there is no such file, whatever the emulator printed is tried as JSON instead.
             *    Either way it may be one value per cycle or one array of them, and whatever
             *    parsed correctly is kept even if a later part is broken. */
            String printed = text(emu.stdout);
            Path jsonFile = dir.resolve(emuJsonName);
            boolean fromFile = Files.isRegularFile(jsonFile);
            boolean fileTooBig = fromFile && Files.size(jsonFile) > MAX_OUTPUT;
            String jsonText = fromFile ? text(readStart(jsonFile, MAX_OUTPUT)) : printed;

            List<Object> cycles = new ArrayList<>();
            String jsonError = null;
            try {
                Json.parseSequence(jsonText, cycles);
            } catch (Json.ParseException e) {
                jsonError = e.getMessage();
            }

            emuInfo.put("json_from", fromFile ? "file " + emuJsonName : "what the emulator printed");
            emuInfo.put("is_json", jsonError == null);
            if (jsonError != null) emuInfo.put("json_error", jsonError);
            // "raw" is what the emulator printed that is not the JSON itself (messages, final registers)
            if ((fromFile || jsonError != null) && !printed.isEmpty()) emuInfo.put("raw", shorten(printed));
            // when the file is broken, send its text along so the mistake can be found
            if (fromFile && jsonError != null) emuInfo.put("json_text", shorten(jsonText));
            emuInfo.put("cycles", cycles);

            if (emu.timedOut)      { reply.put("error", "emulator took too long and was stopped (infinite loop?)"); return reply; }
            if (emu.truncated)     { reply.put("error", "emulator printed too much output and was stopped"); return reply; }
            if (fileTooBig)        { reply.put("error", "the emulator's " + emuJsonName + " is too big (over " + MAX_OUTPUT / (1024 * 1024) + " MB)"); return reply; }
            // The emulator reports "pc=2 is outside the program (0..1)" and exit code 1 when a program
            // simply runs past its last instruction (it has no halt). That is a normal finish here.
            boolean ranToTheEnd = emu.exitCode != 0 && ranPastLastInstruction(printed + text(emu.stderr));
            if (ranToTheEnd) emuInfo.put("note", "the emulator ran every instruction, then stopped because the program has no halt");
            if (emu.exitCode != 0 && !ranToTheEnd) {
                reply.put("error", "emulator failed with exit code " + emu.exitCode);
                return reply;
            }
            if (fromFile && jsonError != null) {
                reply.put("error", "the emulator's " + emuJsonName + " is not valid JSON: " + jsonError);
                return reply;
            }

            /* 6. Build the list of instructions the page's board understands
             *    (items with op, rd, rs1, rs2, imm and asm).
             *    If the CPU's JSON lists the program, as {"program": {"instructions": [...]}}, that
             *    list is used. Otherwise the CPU's JSON is one entry per step it ran, which is a
             *    record of the run and not a list of the program, so the program is read from the
             *    machine code the assembler produced (RISC-V, 4 bytes per instruction). */
            List<Object> instructions = new ArrayList<>();
            List<?> cpuInstructions = findInstructions(cycles);
            if (cpuInstructions != null) {
                for (Object one : cpuInstructions) {
                    if (one instanceof Map) instructions.add(toPageInstruction((Map<?, ?>) one));
                }
                reply.put("instructions_from", "the CPU's JSON");
            } else {
                byte[] code = readStart(machineCode, MAX_OUTPUT);
                if (code.length == 0 || code.length % 4 != 0) {
                    reply.put("error", "the CPU's JSON has no list of instructions, and the assembler's output ("
                            + code.length + " bytes) is not a whole number of 4-byte instructions");
                    return reply;
                }
                instructions.addAll(decodeRiscv(code));
                reply.put("instructions_from", "the assembler's machine code, read as RISC-V");
            }
            reply.put("instructions", instructions);
            reply.put("init", init);

            reply.put("ok", true);
            reply.put("stage", "done");
            return reply;

        } finally {
            deleteFolder(dir);                              // always clean up, even after an error
        }
    }

    /* Every regular file in dir except the one we put there. */
    static List<Path> newFiles(Path dir, Path ours) throws IOException {
        List<Path> found = new ArrayList<>();
        try (DirectoryStream<Path> entries = Files.newDirectoryStream(dir)) {
            for (Path entry : entries) {
                if (Files.isRegularFile(entry) && !entry.equals(ours)) found.add(entry);
            }
        }
        return found;
    }

    static List<String> fileNames(List<Path> paths) {
        List<String> names = new ArrayList<>();
        for (Path p : paths) names.add(p.getFileName().toString());
        Collections.sort(names);
        return names;
    }

    static String text(byte[] bytes) {
        return new String(bytes, StandardCharsets.UTF_8);
    }

    /* Returns the text parsed as JSON, or null if it is not one JSON object or array. */
    static Object tryJson(String s) {
        String t = s.trim();
        if (!t.startsWith("{") && !t.startsWith("[")) return null;
        try {
            return Json.parse(t);
        } catch (Json.ParseException notJson) {
            return null;
        }
    }

    /* Keeps long text from making the reply huge. */
    static String shorten(String s) {
        return s.length() > MAX_RAW_REPLY ? s.substring(0, MAX_RAW_REPLY) : s;
    }

    /* Reads a file, but never more than limit bytes of it. */
    static byte[] readStart(Path file, int limit) throws IOException {
        try (InputStream in = Files.newInputStream(file)) {
            return in.readNBytes(limit);
        }
    }

    static void deleteFolder(Path dir) {
        try (Stream<Path> walk = Files.walk(dir)) {
            // deepest paths first, so a folder is empty by the time it is deleted
            List<Path> all = new ArrayList<>();
            walk.forEach(all::add);
            Collections.reverse(all);
            for (Path p : all) Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // a leftover temp folder is not worth failing the request for
        }
    }

    /* ======================= FROM THE CPU'S JSON TO THE PAGE'S ======================= */

    /*
     * Finds the list of instructions in what the CPU wrote. The expected shape is
     *   {"program": {"name": "...", "instructions": [ {...}, {...} ]}}
     * A plain {"instructions": [...]} or a bare list of instructions is accepted too.
     */
    static List<?> findInstructions(List<Object> values) {
        for (Object value : values) {
            if (!(value instanceof Map)) continue;
            Map<?, ?> map = (Map<?, ?>) value;
            Object program = map.get("program");
            if (program instanceof Map && ((Map<?, ?>) program).get("instructions") instanceof List) {
                return (List<?>) ((Map<?, ?>) program).get("instructions");
            }
            if (program instanceof List) return (List<?>) program;
            if (map.get("instructions") instanceof List) return (List<?>) map.get("instructions");
        }
        boolean bareList = !values.isEmpty() && values.get(0) instanceof Map
                && ((Map<?, ?>) values.get(0)).containsKey("assembly");
        return bareList ? values : null;
    }

    /* True if the emulator's output says the pc went exactly one past the last instruction. */
    static boolean ranPastLastInstruction(String output) {
        Matcher m = Pattern.compile("pc=(\\d{1,9}) is outside the program \\(0\\.\\.(\\d{1,9})\\)").matcher(output);
        return m.find() && Long.parseLong(m.group(1)) == Long.parseLong(m.group(2)) + 1;
    }

    /*
     * Reads RISC-V machine code: every instruction is 4 bytes, lowest byte first, and its
     * bits are laid out like this (for the two kinds the page can animate):
     *
     *   add/sub rd, rs1, rs2     funct7 | rs2 | rs1 | funct3 | rd | opcode 0110011
     *   addi    rd, rs1, number  number (12 bits)| rs1 | funct3 | rd | opcode 0010011
     *
     * Other instructions are named but not taken apart; the page says it cannot animate them.
     */
    static List<Object> decodeRiscv(byte[] code) {
        List<Object> list = new ArrayList<>();
        for (int at = 0; at + 4 <= code.length; at += 4) {
            long word = (code[at] & 0xFFL) | (code[at + 1] & 0xFFL) << 8
                      | (code[at + 2] & 0xFFL) << 16 | (code[at + 3] & 0xFFL) << 24;
            int opcode = (int) (word & 0x7F);
            int rd     = (int) (word >> 7 & 0x1F);
            int funct3 = (int) (word >> 12 & 0x7);
            int rs1    = (int) (word >> 15 & 0x1F);
            int rs2    = (int) (word >> 20 & 0x1F);
            int funct7 = (int) (word >> 25 & 0x7F);
            int number = (int) (word >> 20 & 0xFFF);
            if (number >= 0x800) number -= 0x1000;          // 12 bits, signed: 0xFFF means -1

            Map<String, Object> page = new LinkedHashMap<>();
            String name = riscvName(opcode, funct3, funct7, number);
            page.put("op", name);
            if (opcode == 0x33) {                           // register with register: add, sub, ...
                page.put("rd", rd); page.put("rs1", rs1); page.put("rs2", rs2);
                page.put("asm", name + " r" + rd + ", r" + rs1 + ", r" + rs2);
            } else if (opcode == 0x13) {                    // register with number: addi, ...
                page.put("rd", rd); page.put("rs1", rs1); page.put("imm", number);
                page.put("asm", name + " r" + rd + ", r" + rs1 + ", " + number);
            } else {
                page.put("asm", name);
            }
            page.put("address", at / 4);
            page.put("machineCode", String.format("0x%08x", word));
            list.add(page);
        }
        return list;
    }

    static String riscvName(int opcode, int funct3, int funct7, int number) {
        switch (opcode) {
            case 0x33:
                if (funct7 == 0x00) return new String[] {"add", "sll", "slt", "sltu", "xor", "srl", "or", "and"}[funct3];
                if (funct7 == 0x20 && funct3 == 0) return "sub";
                if (funct7 == 0x20 && funct3 == 5) return "sra";
                if (funct7 == 0x01) return new String[] {"mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu"}[funct3];
                return "unknown";
            case 0x13:
                if (funct3 == 5) return funct7 == 0x20 ? "srai" : "srli";
                return new String[] {"addi", "slli", "slti", "sltiu", "xori", "", "ori", "andi"}[funct3];
            case 0x03: return new String[] {"lb", "lh", "lw", "unknown", "lbu", "lhu", "unknown", "unknown"}[funct3];
            case 0x23: return new String[] {"sb", "sh", "sw", "unknown", "unknown", "unknown", "unknown", "unknown"}[funct3];
            case 0x63: return new String[] {"beq", "bne", "unknown", "unknown", "blt", "bge", "bltu", "bgeu"}[funct3];
            case 0x6F: return "jal";
            case 0x67: return "jalr";
            case 0x37: return "lui";
            case 0x17: return "auipc";
            case 0x73: return number == 0 ? "ecall" : number == 1 ? "ebreak" : "unknown";
            default:   return "unknown";
        }
    }

    /*
     * One instruction, from the CPU's naming to the page's:
     *
     *   CPU:   {"address": 0, "assembly": "addi r1, r1, 5", "machineCode": "...", "opcode": "...",
     *           "type": "...", "rd": 1, "rs1": 1, "rs2": null, "imm": 5}
     *   page:  {"op": "addi", "rd": 1, "rs1": 1, "imm": 5, "asm": "addi r1, r1, 5", ...}
     */
    static Map<String, Object> toPageInstruction(Map<?, ?> cpu) {
        Map<String, Object> page = new LinkedHashMap<>();
        String assembly = (cpu.get("assembly") instanceof String) ? ((String) cpu.get("assembly")).trim() : "";

        // "op" is the instruction's name. The first word of the assembly text is the surest
        // source; the "opcode" field is used when there is no assembly text.
        Object op = "unknown";
        Object opcode = cpu.get("opcode");
        if (!assembly.isEmpty()) {
            op = assembly.split("[\\s,]+")[0].toLowerCase();
        } else if (opcode instanceof Number) {
            op = opcode;
        } else if (opcode instanceof String && !((String) opcode).trim().isEmpty()) {
            Object number = toNumber(opcode);
            op = (number instanceof Number) ? number : ((String) opcode).trim().toLowerCase();
        }
        if ("halt".equals(op)) op = "stop";                 // the emulator's HALT is the page's "stop"
        page.put("op", op);

        // registers may arrive as 3, "3", "r3" or "x3"; null means "this instruction has none"
        for (String name : new String[] {"rd", "rs1", "rs2"}) {
            Object value = cpu.get(name);
            if (value instanceof String) value = ((String) value).trim().replaceFirst("^[rRxX](?=\\d)", "");
            if (value != null) page.put(name, toNumber(value));
        }
        if (cpu.get("imm") != null) page.put("imm", toNumber(cpu.get("imm")));
        if (!assembly.isEmpty()) page.put("asm", assembly);

        // carried along unchanged, for anything on the page that wants them later
        for (String name : new String[] {"address", "machineCode", "opcode", "type"}) {
            if (cpu.get(name) != null) page.put(name, cpu.get(name));
        }
        return page;
    }

    /* 5, 5.0, "5", "-1" and "0x10" all become whole numbers; anything else is left as it is. */
    static Object toNumber(Object value) {
        if (value instanceof Double) {
            double d = (Double) value;
            return (d == Math.rint(d) && Math.abs(d) < 1e15) ? (Object) (long) d : value;
        }
        if (value instanceof String) {
            try {
                return Long.decode(((String) value).trim());
            } catch (NumberFormatException notANumber) {
                return value;
            }
        }
        return value;
    }

    /*
     * Reads the page's Starting registers box, for example "r1=100, r2=0x20", into
     * {"1": 100, "2": 32}. Throws IllegalArgumentException with a message for the user.
     */
    static Map<String, Object> parseRegisters(String text) {
        Map<String, Object> init = new LinkedHashMap<>();
        Pattern oneRegister = Pattern.compile("[rR](\\d{1,3})\\s*=\\s*(0[xX][0-9a-fA-F]{1,9}|\\d{1,11})");
        for (String part : text.split("[,;]+|\\s+(?=[rR]\\d)")) {
            part = part.trim();
            if (part.isEmpty()) continue;
            Matcher m = oneRegister.matcher(part);
            if (!m.matches()) {
                throw new IllegalArgumentException("Could not read \"" + part
                        + "\" in the starting registers. Try: r1=100, r2=0x20");
            }
            int register = Integer.parseInt(m.group(1));
            String number = m.group(2);
            long value = number.toLowerCase().startsWith("0x")
                    ? Long.parseLong(number.substring(2), 16)
                    : Long.parseLong(number);                       // plain decimal, so "010" is ten
            if (register < 1 || register > 16) {
                throw new IllegalArgumentException("Starting registers must be r1 to r16 (r"
                        + register + " does not exist).");
            }
            if (value > 4294967295L) {
                throw new IllegalArgumentException("r" + register
                        + " holds an unsigned 32-bit number, so " + number + " is too big.");
            }
            init.put(String.valueOf(register), value);
        }
        return init;
    }

    /* ======================= RUNNING A C PROGRAM ======================= */

    /* What came back from running one tool. */
    static class ToolResult {
        int exitCode;                                       // 0 normally means success
        boolean timedOut;                                   // we killed it for running too long
        boolean truncated;                                  // we killed it for printing too much
        byte[] stdout;                                      // what it printed normally
        byte[] stderr;                                      // what it printed as errors
    }

    /*
     * Runs a command in the given folder and collects what it prints.
     * The command is passed as a list (program, argument, ...) and never goes through a
     * shell, so nothing in the user's program text can be run as a command.
     */
    static ToolResult runTool(List<String> command, Path dir, long timeoutMs)
            throws IOException, InterruptedException {
        Process process = new ProcessBuilder(command).directory(dir.toFile()).start();
        process.getOutputStream().close();                  // the tools get no keyboard input

        // Both outputs must be read WHILE the tool runs. If nobody reads, the tool
        // blocks as soon as its output buffer fills up, and waits forever.
        Capture out = new Capture(process.getInputStream(), process);
        Capture err = new Capture(process.getErrorStream(), process);
        out.start();
        err.start();

        ToolResult result = new ToolResult();
        if (!process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)) {   // still running after the time limit
            result.timedOut = true;
            process.destroyForcibly();
        }
        process.waitFor();                                  // now it has definitely ended
        out.join();
        err.join();

        result.exitCode  = process.exitValue();
        result.truncated = out.truncated || err.truncated;
        result.stdout    = out.buffer.toByteArray();
        result.stderr    = err.buffer.toByteArray();
        return result;
    }

    /* A background thread that collects one output stream, up to MAX_OUTPUT bytes. */
    static class Capture extends Thread {
        final InputStream in;
        final Process process;
        final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        volatile boolean truncated;

        Capture(InputStream in, Process process) {
            this.in = in;
            this.process = process;
        }

        @Override
        public void run() {
            byte[] chunk = new byte[8192];
            try {
                int n;
                while ((n = in.read(chunk)) != -1) {
                    int room = MAX_OUTPUT - buffer.size();
                    if (n > room) {                         // too much: keep what fits, stop the tool
                        buffer.write(chunk, 0, room);
                        truncated = true;
                        process.destroyForcibly();
                        break;
                    }
                    buffer.write(chunk, 0, n);
                }
            } catch (IOException ignored) {
                // the stream closes when the tool is killed; what we have is what we keep
            }
        }
    }

    /* ======================= JSON ======================= */

    /*
     * A small JSON parser and writer.
     *
     * JSON text becomes ordinary Java objects:
     *   { ... }        -> Map<String, Object>   (keeps the order of the keys)
     *   [ ... ]        -> List<Object>
     *   "text"         -> String
     *   12, -3         -> Long
     *   1.5, 2e10      -> Double
     *   true / false   -> Boolean
     *   null           -> null
     *
     * The parser is "recursive descent": one method per kind of value, and the methods
     * call each other, because an object can contain an array that contains an object...
     *
     * One thing it allows that strict JSON does not: a comma just before a closing
     * ] or }, as in [1, 2, ]. Programs that print JSON by hand often leave one there.
     */
    static final class Json {

        /* Thrown when the text is not valid JSON. The message says where. */
        static class ParseException extends Exception {
            ParseException(String message) { super(message); }
        }

        private static final int MAX_DEPTH = 200;           // how deeply values may be nested

        private final String s;                             // the text being parsed
        private int i = 0;                                  // position of the next unread character
        private int depth = 0;                              // how many { or [ we are inside

        private Json(String text) { this.s = text; }

        /* Parses text that holds exactly one JSON value. */
        static Object parse(String text) throws ParseException {
            Json p = new Json(text);
            p.skipSpace();
            Object value = p.value();
            p.skipSpace();
            if (p.i < p.s.length()) throw p.error("unexpected text after the end of the JSON value");
            return value;
        }

        /*
         * Parses text holding several JSON values one after another (separated by spaces,
         * newlines or commas), adding each to out. If the text is a single array, its
         * elements are added instead. On an error, the values before it are still in out.
         */
        static void parseSequence(String text, List<Object> out) throws ParseException {
            Json p = new Json(text);
            int start = out.size();
            while (true) {
                while (p.i < p.s.length() && (Character.isWhitespace(p.s.charAt(p.i)) || p.s.charAt(p.i) == ',')) p.i++;
                if (p.i >= p.s.length()) break;
                out.add(p.value());
            }
            if (out.size() == start + 1 && out.get(start) instanceof List) {    // one array: unwrap it
                List<?> only = (List<?>) out.remove(start);
                out.addAll(only);
            }
        }

        /* ---- one method per kind of value ---- */

        private Object value() throws ParseException {
            if (i >= s.length()) throw error("unexpected end of text");
            char c = s.charAt(i);
            if (c == '{') return object();
            if (c == '[') return array();
            if (c == '"') return string();
            if (c == '-' || (c >= '0' && c <= '9')) return number();
            if (s.startsWith("true", i))  { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i))  { i += 4; return null; }
            throw error("unexpected character '" + c + "'");
        }

        private Map<String, Object> object() throws ParseException {
            Map<String, Object> map = new LinkedHashMap<>();
            enter();
            i++;                                            // skip {
            skipSpace();
            if (peek() == '}') { i++; depth--; return map; }    // empty object
            while (true) {
                skipSpace();
                if (peek() == '}' && !map.isEmpty()) { i++; depth--; return map; }  // comma before }
                if (peek() != '"') throw error("expected a key in double quotes");
                String key = string();
                skipSpace();
                if (peek() != ':') throw error("expected ':' after the key \"" + key + "\"");
                i++;                                        // skip :
                skipSpace();
                map.put(key, value());
                skipSpace();
                char c = peek();
                if (c == ',') { i++; continue; }            // another key follows
                if (c == '}') { i++; depth--; return map; } // end of the object
                throw error("expected ',' or '}' in an object");
            }
        }

        private List<Object> array() throws ParseException {
            List<Object> list = new ArrayList<>();
            enter();
            i++;                                            // skip [
            skipSpace();
            if (peek() == ']') { i++; depth--; return list; }   // empty array
            while (true) {
                skipSpace();
                if (peek() == ']' && !list.isEmpty()) { i++; depth--; return list; }    // comma before ]
                list.add(value());
                skipSpace();
                char c = peek();
                if (c == ',') { i++; continue; }            // another element follows
                if (c == ']') { i++; depth--; return list; }    // end of the array
                throw error("expected ',' or ']' in an array");
            }
        }

        private String string() throws ParseException {
            StringBuilder out = new StringBuilder();
            i++;                                            // skip the opening "
            while (true) {
                if (i >= s.length()) throw error("a string is missing its closing quote");
                char c = s.charAt(i++);
                if (c == '"') return out.toString();        // closing quote: done
                if (c != '\\') { out.append(c); continue; } // an ordinary character

                // a backslash starts an escape such as \n or \u0041
                if (i >= s.length()) throw error("a string ends in the middle of an escape");
                char e = s.charAt(i++);
                switch (e) {
                    case '"':  out.append('"');  break;
                    case '\\': out.append('\\'); break;
                    case '/':  out.append('/');  break;
                    case 'b':  out.append('\b'); break;
                    case 'f':  out.append('\f'); break;
                    case 'n':  out.append('\n'); break;
                    case 'r':  out.append('\r'); break;
                    case 't':  out.append('\t'); break;
                    case 'u':
                        if (i + 4 > s.length()) throw error("\\u needs four hex digits");
                        try {
                            out.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
                        } catch (NumberFormatException bad) {
                            throw error("\\u needs four hex digits");
                        }
                        i += 4;
                        break;
                    default:
                        throw error("unknown escape \\" + e);
                }
            }
        }

        private Object number() throws ParseException {
            int start = i;
            boolean whole = true;                           // no '.', 'e' or 'E' seen: it is an integer
            if (peek() == '-') i++;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c >= '0' && c <= '9') { i++; }
                else if (c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-') { whole = false; i++; }
                else break;
            }
            String digits = s.substring(start, i);
            try {
                if (whole) return Long.parseLong(digits);
            } catch (NumberFormatException tooBig) {
                // an integer too big for a long: fall through and keep it as a double
            }
            try {
                return Double.parseDouble(digits);
            } catch (NumberFormatException bad) {
                i = start;
                throw error("badly formed number '" + digits + "'");
            }
        }

        /* ---- small helpers ---- */

        private char peek() {                               // the next character, or 0 at the end
            return i < s.length() ? s.charAt(i) : '\0';
        }

        private void skipSpace() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
        }

        private void enter() throws ParseException {        // going one level deeper
            if (++depth > MAX_DEPTH) throw error("nested too deeply");
        }

        private ParseException error(String message) {     // adds "line X, column Y" to a message
            int line = 1, column = 1;
            for (int k = 0; k < i && k < s.length(); k++) {
                if (s.charAt(k) == '\n') { line++; column = 1; } else { column++; }
            }
            return new ParseException(message + " at line " + line + ", column " + column);
        }

        /* ---- writing: Java objects back to JSON text ---- */

        static String write(Object value) {
            StringBuilder out = new StringBuilder();
            write(value, out);
            return out.toString();
        }

        private static void write(Object value, StringBuilder out) {
            if (value == null) {
                out.append("null");
            } else if (value instanceof String) {
                writeString((String) value, out);
            } else if (value instanceof Double || value instanceof Float) {
                double d = ((Number) value).doubleValue();
                out.append(Double.isNaN(d) || Double.isInfinite(d) ? "null" : String.valueOf(d));  // JSON has no NaN
            } else if (value instanceof Number || value instanceof Boolean) {
                out.append(value);
            } else if (value instanceof Map) {
                out.append('{');
                boolean first = true;
                for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                    if (!first) out.append(',');
                    first = false;
                    writeString(String.valueOf(entry.getKey()), out);
                    out.append(':');
                    write(entry.getValue(), out);
                }
                out.append('}');
            } else if (value instanceof Iterable) {
                out.append('[');
                boolean first = true;
                for (Object element : (Iterable<?>) value) {
                    if (!first) out.append(',');
                    first = false;
                    write(element, out);
                }
                out.append(']');
            } else {
                writeString(value.toString(), out);         // anything else: write it as text
            }
        }

        private static void writeString(String text, StringBuilder out) {
            out.append('"');
            for (int k = 0; k < text.length(); k++) {
                char c = text.charAt(k);
                switch (c) {
                    case '"':  out.append("\\\""); break;
                    case '\\': out.append("\\\\"); break;
                    case '\n': out.append("\\n");  break;
                    case '\r': out.append("\\r");  break;
                    case '\t': out.append("\\t");  break;
                    case '\b': out.append("\\b");  break;
                    case '\f': out.append("\\f");  break;
                    default:
                        if (c < 0x20) out.append(String.format("\\u%04x", (int) c));   // other control characters
                        else out.append(c);
                }
            }
            out.append('"');
        }
    }
}