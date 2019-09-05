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

    public sendSwap(
        peerId: string,
        multiAddress: string,
        receivingAccount: string
    ) {
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
            beta_ledger_redeem_identity: receivingAccount,
            alpha_expiry: moment().unix() + 7200,
            beta_expiry: moment().unix() + 3600,
            peer: {
                peer_id: peerId,
                address_hint: multiAddress,
            },
        };

        return this.cnd.postSwap(swap);
    }

    public async acceptSwap(refundAccount: string) {
        const swaps = await this.cnd.getSwaps();
        const swap = swaps[0];
        const actions = swap.actions;
        const acceptAction = actions!.find(action => action.name === "accept");

        return this.cnd.postAccept(acceptAction!, refundAccount);
    }
}
