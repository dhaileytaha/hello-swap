import changeCase from "change-case";
import moment from "moment";
import { Action, EmbeddedRepresentationSubEntity } from "../gen/siren";
import { PropertiesOfASWAP } from "../gen/swap";
import { Cnd, LedgerAction } from "./cnd";
import LedgerActionHandler from "./ledgerActions";

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
    private static toSwap(entity: EmbeddedRepresentationSubEntity): Swap {
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
    }
    private readonly cnd: Cnd;
    private readonly ethereumAddress: string;
    private readonly whoAmI: string;
    private readonly ledgerActionHandler: any;
    private actionsDone: string[];

    public constructor(
        cndUrl: string,
        ethereumAddress: string,
        whoAmI: string,
        ledgerActionHandler: LedgerActionHandler
    ) {
        this.cnd = new Cnd(cndUrl);
        this.ethereumAddress = ethereumAddress;
        this.whoAmI = whoAmI;
        this.ledgerActionHandler = ledgerActionHandler;
        this.actionsDone = [];

        // On an interval, get all swaps that can be funded or redeemed
        // and perform the corresponding action using a wallet

        setInterval(() => {
            this.getOngoingSwaps().then(
                (swaps: EmbeddedRepresentationSubEntity[]) => {
                    swaps.forEach((swap: EmbeddedRepresentationSubEntity) =>
                        this.performNextLedgerAction(swap)
                    );
                }
            );
        }, 2000);
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
        console.log(`[${this.whoAmI}] Sending offer to:`, peerId);
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
            .map(HelloSwap.toSwap);
    }

    public async acceptSwap(swap: Swap) {
        const swapDetails = await this.cnd.getSwap(swap.id);
        const actions = swapDetails.actions;
        const acceptAction = actions!.find(action => action.name === "accept");

        return this.cnd.postAccept(acceptAction!, this.ethereumAddress);
    }

    private async doLedgerAction(action: LedgerAction) {
        const type = changeCase.pascalCase(action.type);
        return (this.ledgerActionHandler as any)[`do${type}`](action.payload);
    }

    private async getOngoingSwaps(): Promise<
        EmbeddedRepresentationSubEntity[]
    > {
        const swaps = await this.cnd.getSwaps();

        return swaps.filter((swap: EmbeddedRepresentationSubEntity) => {
            return (
                swap.actions &&
                !!swap.actions.find((action: Action) => {
                    return action.name === "fund" || action.name === "redeem";
                })
            );
        });
    }

    private performNextLedgerAction(entity: EmbeddedRepresentationSubEntity) {
        const swap = HelloSwap.toSwap(entity);

        const action = entity.actions!.find((action: Action) => {
            return action.name === "fund" || action.name === "redeem";
        })!;

        return this.cnd
            .getAction(action.href)
            .then((ledgerAction: LedgerAction) => {
                const stringAction = JSON.stringify(ledgerAction);
                if (this.actionsDone.indexOf(stringAction) === -1) {
                    this.actionsDone.push(stringAction);
                    console.log(
                        `[${this.whoAmI}] ${changeCase.titleCase(
                            action.name
                        )}ing ${
                            action.name === "fund"
                                ? swap.sellAsset.name
                                : swap.buyAsset.name
                        } for`,
                        JSON.stringify(swap.id)
                    );
                    return this.doLedgerAction(ledgerAction);
                }
            });
    }
}
