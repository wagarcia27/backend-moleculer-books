"use strict";

const DbMixin = require("../mixins/db.mixin");

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
	name: "searches",
	mixins: [DbMixin("searches")],
	settings: {
		fields: ["_id", "term", "createdAt"],
		entityValidator: {
			term: "string|min:1"
		}
	},
	actions: {
		add: {
			params: { term: "string|min:1" },
			async handler(ctx) {
				const doc = await this.adapter.insert({ term: ctx.params.term, createdAt: new Date() });
				return { _id: String(doc._id) };
			}
		},
		last: {
			rest: "GET /last-search",
			async handler() {
				try {
					const list = await this.adapter.find({ query: {}, sort: ["-createdAt"], limit: 5 });
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


