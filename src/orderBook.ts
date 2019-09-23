export interface Offer {
    sellCoin: Coin;
    buyCoin: Coin;
    makerPeerId: string;
    makerPeerAddress: string;
}

export enum CoinType {
    Bitcoin = "bitcoin",
    Ether = "ether",
}

export interface Coin {
    coin: CoinType;
    amount: number;
}

export class OrderBook {
    private readonly offers: Offer[];

    public constructor() {
        this.offers = [];
    }

    public addOffer(offer: Offer) {
        this.offers.push(offer);
    }
}
