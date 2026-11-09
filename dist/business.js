export async function sendOwnerLoginCode(http, email) {
    await http.request("/api/v1/auth/otp/send", { method: "POST", auth: { kind: "none" }, body: { email } });
}
export async function verifyOwnerLoginCode(http, email, code) {
    const res = await http.request("/api/v1/auth/otp/verify", {
        method: "POST",
        auth: { kind: "none" },
        body: { email, code },
    });
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}
export class BusinessApi {
    #http;
    #auth;
    constructor(http, accessToken) {
        this.#http = http;
        this.#auth = { kind: "bearer", token: accessToken };
    }
    #keyPath(id, suffix = "") {
        return `/api/v1/partner/api-keys/${encodeURIComponent(id)}${suffix}`;
    }
    async listKeys() {
        const res = await this.#http.request("/api/v1/partner/api-keys", {
            auth: this.#auth,
        });
        return res.body.data.keys;
    }
    async createKey(input) {
        const res = await this.#http.request("/api/v1/partner/api-keys", {
            method: "POST",
            auth: this.#auth,
            body: input,
        });
        return res.body;
    }
    async revokeKey(id) {
        await this.#http.request(this.#keyPath(id), { method: "DELETE", auth: this.#auth });
    }
    async getLimits(id) {
        const res = await this.#http.request(this.#keyPath(id, "/limits"), { auth: this.#auth });
        return res.body.data;
    }
    async requestActionCode(id, action) {
        await this.#http.request(this.#keyPath(id, "/otp"), { method: "POST", auth: this.#auth, body: { action } });
    }
    async setLimits(id, input) {
        const res = await this.#http.request(this.#keyPath(id, "/limits"), {
            method: "PUT",
            auth: this.#auth,
            body: input,
        });
        return res.body.data;
    }
    async audit(id, limit = 25) {
        const res = await this.#http.request(this.#keyPath(id, "/audit"), {
            auth: this.#auth,
            query: { limit },
        });
        return res.body.data.events;
    }
    async getCallback(id) {
        const res = await this.#http.request(this.#keyPath(id, "/callback"), { auth: this.#auth });
        return res.body.data;
    }
    async setCallback(id, input) {
        const res = await this.#http.request(this.#keyPath(id, "/callback"), { method: "PUT", auth: this.#auth, body: input });
        return res.body.data;
    }
    async verifyCallback(id) {
        const res = await this.#http.request(this.#keyPath(id, "/callback/verify"), {
            method: "POST",
            auth: this.#auth,
            body: {},
        });
        return res.body.data;
    }
    async disableCallback(id) {
        const res = await this.#http.request(this.#keyPath(id, "/callback/disable"), {
            method: "POST",
            auth: this.#auth,
            body: {},
        });
        return res.body.data;
    }
}
//# sourceMappingURL=business.js.map