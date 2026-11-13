import { CHAIN } from "../chain/config.ts";
import { runLive } from "./live.ts";
import { replay } from "./replay.ts";

const hasKeys = CHAIN.OWNER_KEY && CHAIN.AGENT_LEASH_KEY && CHAIN.AGENT_FULL_KEY;
if (hasKeys && !process.argv.includes("--replay")) await runLive();
else await replay();
