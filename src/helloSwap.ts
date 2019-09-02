import { Cnd } from "./cnd";

/**
 * The main class of our app. Connects to a cnd, automatically actions available swaps.
 * Can initiate a swap request.
 */
export class HelloSwap {
    private readonly cnd: Cnd;

    public constructor(cndUrl: string) {
        this.cnd = new Cnd(cndUrl);
    }

    public cndPeerId(): Promise<string> {
        return this.cnd.getPeerId();
    }
}
