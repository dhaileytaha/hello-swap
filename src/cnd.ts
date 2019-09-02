import axios from "axios";

interface GetInfo {
    id: string;
    listen_addresses: string[]; // multiaddresses
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

    private async getInfo(): Promise<GetInfo> {
        const response = await axios.get(this.cndUrl);
        return response.data;
    }
}
