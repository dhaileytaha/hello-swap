import axios from "axios";

interface GetInfo {
    id: string;
    listen_addresses: string[]; // multiaddresses
}

export interface Ledger {
    name: string;
    network: string;
}

export interface Asset {
    name: string;
    quantity: string;
}

export interface Peer {
    peer_id: string;
    address_hint: string;
}

export interface SwapRequest {
    alpha_ledger: Ledger;
    alpha_asset: Asset;
    beta_ledger: Ledger;
    beta_asset: Asset;
    alpha_expiry: number;
    beta_expiry: number;
    alpha_ledger_refund_identity?: string;
    beta_ledger_redeem_identity?: string;
    peer: Peer;
}

/**
 * Facilitates access to the cnd REST API
 */
export class Cnd {
    private readonly cndUrl: string;

    public constructor(cndUrl: string) {
        this.cndUrl = cndUrl;
    }

    public async getPeerId(): Promise<string> {
        const info = await this.getInfo();
        return info.id;
    }

    public postSwap(swap: SwapRequest): Promise<string> {
        return axios.post(this.cndUrl + "swaps/rfc003", swap);
    }

    private async getInfo(): Promise<GetInfo> {
        const response = await axios.get(this.cndUrl);
        return response.data;
    }
}
