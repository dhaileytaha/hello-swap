import moment from "moment";
import { Action, EmbeddedRepresentationSubEntity } from "../gen/siren";
import { PropertiesOfASWAP } from "../gen/swap";
import { Cnd } from "./cnd";

export interface Asset {
    name: string;
    quantity: string;
}

export interface Swap {
    id: string;
    counterparty: string;
    buyAsset: Asset;
    sellAsset: Asset;
}

/**
 * The main class of our app. Connects to a cnd, automatically actions available swaps.
 * Can initiate a swap request.
 */
export class HelloSwap {
    private readonly cnd: Cnd;
    private readonly ethereumAddress: string;

    public constructor(cndUrl: string, ethereumAddress: string) {
        this.cnd = new Cnd(cndUrl);
        this.ethereumAddress = ethereumAddress;
    }

    public cndPeerId(): Promise<string> {
        return this.cnd.getPeerId();
    }

    public makeOfferSellBtcBuyEth(
        sats: string,
        wei: string,
        peerId: string,
        peerAddress: string
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
                quantity: sats,
            },
            beta_asset: {
                name: "ether",
                quantity: wei,
            },
            beta_ledger_redeem_identity: this.ethereumAddress,
            alpha_expiry: moment().unix() + 7200,
            beta_expiry: moment().unix() + 3600,
            peer: {
                peer_id: peerId,
                address_hint: peerAddress,
            },
        };

        return this.cnd.postSwap(swap);
    }

    public async getNewSwaps(): Promise<Swap[]> {
        const swaps = await this.cnd.getSwaps();
        return swaps
            .filter((swap: EmbeddedRepresentationSubEntity) => {
                return (
                    swap.actions &&
                    !!swap.actions.find((action: Action) => {
                        return action.name === "accept";
                    })
                );
            })
            .map((entity: EmbeddedRepresentationSubEntity) => {
                const swapProperties = entity.properties as PropertiesOfASWAP;
                const buyAsset =
                    swapProperties.role === "Alice"
                        ? swapProperties.parameters.beta_asset
                        : swapProperties.parameters.alpha_asset;
                const sellAsset =
                    swapProperties.role === "Alice"
                        ? swapProperties.parameters.alpha_asset
                        : swapProperties.parameters.beta_asset;

                return {
                    id: swapProperties.id,
                    counterparty: swapProperties.counterparty,
                    buyAsset: {
                        name: buyAsset.name,
                        quantity: buyAsset.quantity,
                    },
                    sellAsset: {
                        name: sellAsset.name,
                        quantity: sellAsset.quantity,
                    },
                };
            });
    }

    public async acceptSwap(swap: Swap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const acceptAction = actions!.find(action => action.name === "accept");

        return this.cnd.postAccept(acceptAction!, this.ethereumAddress);
    }
}
