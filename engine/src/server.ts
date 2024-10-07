import Hapi from "@hapi/hapi";

async function init() {
  const server = Hapi.server({
    port: 8999,
    host: "localhost",
    routes: {
      cors: {
        origin: ["*"], // Allows requests from any origin
        additionalHeaders: ["cache-control", "x-requested-with"], // Add any additional headers you need
      },
    },
  });

  server.route({
    method: "GET",
    path: "/",
    handler: (request, h) => {
      return { foo: "bar" };
    },
  });

  await server.start();
  console.log("Server running on %s", server.info.uri);
}

init().catch((err) => {
  console.error("Failed starting server");
  console.error(err);
  process.exit(1);
});
