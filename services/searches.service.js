"use strict";

const DbMixin = require("../mixins/db.mixin");

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
	name: "searches",
	mixins: [DbMixin("searches")],
	settings: {
		fields: ["_id", "username", "term", "createdAt"],
		entityValidator: {
			term: "string|min:1",
			username: { type: "string", optional: true }
		}
	},
	actions: {
		add: {
			params: { term: "string|min:1" },
			async handler(ctx) {
				const username = ctx.meta.user && ctx.meta.user.username;
				if (!username) return { ok: false, skipped: true };
				const doc = await this.adapter.insert({ username, term: ctx.params.term, createdAt: new Date() });
				return { ok: true, _id: String(doc._id) };
			}
		},
		last: {
			rest: "GET /last-search",
			async handler(ctx) {
				try {
					const username = ctx.meta.user && ctx.meta.user.username;
					const query = username ? { username } : {};
					const list = await this.adapter.find({ query, sort: ["-createdAt"], limit: 5 });
					return list.map(i => ({ id: String(i._id), term: i.term, createdAt: i.createdAt }));
				} catch (err) {
					this.logger.error("Error en searches.last:", err);
					return [];
				}
			}
		}
	},
	methods: {},

	async afterConnected() {
		this.logger.info("Conectado a MongoDB (collection 'searches')");
	}
};


