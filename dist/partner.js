export class PartnerApi {
    #http;
    #auth;
    constructor(http, credentials) {
        this.#http = http;
        this.#auth = { kind: "partner", ...credentials };
    }
    async registerUser(input) {
        const res = await this.#http.request("/api/v1/partner/users", {
            method: "POST",
            auth: this.#auth,
            body: input,
        });
        return res.body.data.user;
    }
    async listUsers(query = {}) {
        const res = await this.#http.request("/api/v1/partner/users", {
            auth: this.#auth,
            query,
        });
        return res.body.data.users;
    }
    async getUser(userId) {
        const res = await this.#http.request(`/api/v1/partner/users/${encodeURIComponent(userId)}`, { auth: this.#auth });
        return res.body.data.user;
    }
    async subdivisions(country) {
        const res = await this.#http.request("/api/v1/user/kyc/subdivisions", { auth: this.#auth, query: { country } });
        return res.body.data.subdivisions;
    }
    async createProfile(userId, profile) {
        const res = await this.#http.request("/api/v1/user/profile", {
            method: "POST",
            auth: this.#auth,
            body: { ...profile, userId },
        });
        return res.body.data.profile;
    }
    async checkProfileCompletion(userId) {
        const res = await this.#http.request("/api/v1/user/profile/check-completion", { auth: this.#auth, query: { userId } });
        return res.body.data;
    }
    async startKyc(userId, identity) {
        const res = await this.#http.request("/api/v1/user/kyc/start", {
            method: "POST",
            auth: this.#auth,
            body: { ...identity, userId },
        });
        return res.body.data;
    }
    async sendLoginCode(email) {
        await this.#http.request("/api/v1/partner/auth/send", { method: "POST", auth: this.#auth, body: { email } });
    }
    async verifyLoginCode(email, code) {
        const res = await this.#http.request("/api/v1/partner/auth/verify", {
            method: "POST",
            auth: this.#auth,
            body: { email, code },
        });
        return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
    }
}
//# sourceMappingURL=partner.js.map