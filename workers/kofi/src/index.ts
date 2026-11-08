import { createReceiver, type Env } from "./handler";

const receive = createReceiver({
  fetch: (input, init) => fetch(input, init),
  now: () => new Date(),
});

export default {
  fetch: (request: Request, env: Env): Promise<Response> => receive(request, env),
} satisfies ExportedHandler<Env>;
