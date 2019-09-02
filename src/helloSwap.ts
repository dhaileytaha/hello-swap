import moment from "moment";
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

    public sendSwap(peerId: string, multiAddress: string) {
        const swap = {
            alpha_ledger: {
                name: "bitcoin",
                network: "regtest",
            },
            beta_ledger: {
                name: "ethereum",
                network: "regtest",
            },
            alpha_asset: {
                name: "bitcoin",
                quantity: "100000000",
            },
            beta_asset: {
                name: "ether",
                quantity: "9000000000000000000",
            },
            beta_ledger_redeem_identity:
                "0x965e564002ea5c4f69fe4755b5912d1039f9a94e",
            alpha_expiry: moment().unix() + 7200,
            beta_expiry: moment().unix() + 3600,
            peer: {
                peer_id: peerId,
                address_hint: multiAddress,
            },
        };

        return this.cnd.postSwap(swap);
    }
}
