// Placeholder from U1; U9 replaces this with the hibernating, chunked-save Board.
import { YServer } from "y-partyserver";
import { routePartykitRequest } from "partyserver";

export class Board extends YServer {}

export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) ?? env.ASSETS.fetch(request);
  },
};
