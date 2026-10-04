import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;

public class Server {
	public static void main(String[] args) throws Exception {
		HttpServer server = HttpServer.create(
				new InetSocketAddress("0.0.0.0", 8080), 0
				);


		server.createContext("/run", exchange -> {
			if (exchange.getRequestMethod().equals("POST")) {
				String body = new String(
						exchange.getRequestBody().readAllBytes(),
						StandardCharsets.UTF_8
						);

				// frontend/ -> project root
				Files.writeString(Path.of("../newFile.s"), body);

				try {
					Process assembler = new ProcessBuilder(
							"./assemblr",
							"newFile.s"
							)
						.directory(Path.of("..").toFile())
						.inheritIO()
						.start();

					assembler.waitFor();

					Process emulator = new ProcessBuilder(
							"./emu",
							"../asoutput.exe"
							)
						.directory(Path.of("../emu").toFile())
						.inheritIO()
						.start();

					emulator.waitFor();

				} catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					e.printStackTrace();
				}

				// get emulator JSON
				String json = Files.readString(
						Path.of("../emu/cpu_json_output.json")
						);

				byte[] response = json.getBytes(StandardCharsets.UTF_8);

				exchange.getResponseHeaders().set(
						"Content-Type", "application/json"
						);
				exchange.sendResponseHeaders(200, response.length);
				exchange.getResponseBody().write(response);
				exchange.close();
			}
		});
		server.createContext("/", exchange -> {

			// Print incoming request
			System.out.println("\n===== INCOMING REQUEST =====");
			System.out.println(exchange.getRequestMethod() + " " +
					exchange.getRequestURI());

			exchange.getRequestHeaders().forEach((key, values) ->
					System.out.println(key + ": " + String.join(", ", values))
					);

			byte[] requestBody = exchange.getRequestBody().readAllBytes();

			if (requestBody.length > 0) {
				System.out.println("\nBODY:");
				System.out.println(
						new String(requestBody, StandardCharsets.UTF_8)
						);
			}

			System.out.println("============================\n");


			String request = exchange.getRequestURI().getPath();

			if (request.equals("/")) {
				request = "/index.html";
			}

			Path file = Path.of("." + request);

			String contentType = "text/plain";

			if (request.endsWith(".html"))
				contentType = "text/html";
			else if (request.endsWith(".css"))
				contentType = "text/css";
			else if (request.endsWith(".js"))
				contentType = "application/javascript";

			byte[] data = Files.readAllBytes(file);

			exchange.getResponseHeaders().set("Content-Type", contentType);
			exchange.sendResponseHeaders(200, data.length);
			exchange.getResponseBody().write(data);
			exchange.close();
		});

		server.start();
		System.out.println("Running at http://localhost:8080");
	}
}
