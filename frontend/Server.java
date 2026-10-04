import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;

public class Server {
    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(
            new InetSocketAddress("0.0.0.0", 8080), 0
        );

        server.createContext("/", exchange -> {
            String request = exchange.getRequestURI().getPath();

            if (request.equals("/")) {
                request = "/index.html";
            }

            Path file = Path.of("." + request);

            if (!Files.exists(file)) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }

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
