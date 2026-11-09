export class UserApi {
    #http;
    #auth;
    constructor(http, accessToken) {
        this.#http = http;
        this.#auth = { kind: "bearer", token: accessToken };
    }
    async kycStatus() {
        const res = await this.#http.request("/api/v1/user/kyc/status", {
            auth: this.#auth,
        });
        return res.body.data;
    }
    async occupations() {
        const res = await this.#http.request("/api/v1/user/kyc/occupations", { auth: this.#auth });
        return res.body.data.entries;
    }
    async accounts() {
        const res = await this.#http.request("/api/v1/user/accounts", { auth: this.#auth });
        return res.body.items;
    }
    async balance() {
        const res = await this.#http.request("/api/v1/user/balance", { auth: this.#auth });
        return res.body.items;
    }
    async transactions(query = {}) {
        const res = await this.#http.request("/api/v1/transactions", {
            auth: this.#auth,
            query,
        });
        return res.body;
    }
    async transaction(uuid) {
        const res = await this.#http.request("/api/v1/transactions", {
            auth: this.#auth,
            query: { id: uuid },
        });
        return res.body;
    }
    async transfer(input) {
        const res = await this.#http.request("/api/v1/transactions/transfer", {
            method: "POST",
            auth: this.#auth,
            body: input,
        });
        return res.body;
    }
    async pendingAuthorizations() {
        const res = await this.#http.request("/api/v1/authorizations/pending", { auth: this.#auth });
        return res.body;
    }
    async requestApprovalCode(ref) {
        await this.#http.request(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/challenge`, {
            method: "POST",
            auth: this.#auth,
        });
    }
    async approve(ref, otpCode) {
        const res = await this.#http.request(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/approve`, {
            method: "POST",
            auth: this.#auth,
            body: { otpCode },
        });
        return res.body;
    }
    async reject(ref, reason) {
        const res = await this.#http.request(`/api/v1/authorizations/ref/${encodeURIComponent(ref)}/reject`, {
            method: "POST",
            auth: this.#auth,
            body: reason ? { reason } : {},
        });
        return res.body;
    }
}
export async function refreshSession(http, refreshToken) {
    const res = await http.request("/api/v1/auth/refresh", {
        method: "POST",
        auth: { kind: "none" },
        body: { refreshToken },
    });
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}
//# sourceMappingURL=user.js.map