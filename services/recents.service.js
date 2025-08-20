"use strict";

const DbMixin = require("../mixins/db.mixin");

/**
 * Guarda los últimos libros seleccionados por usuario (máx 5, por recencia).
 */
module.exports = {
	name: "recents",
	mixins: [DbMixin("recents")],

	settings: {
		fields: [
			"_id",
			"username",
			"openLibraryWorkKey",
			"title",
			"author",
			"publishYear",
			"coverId",
			"coverImageBase64",
			"coverMimeType",
			"createdAt"
		],
		entityValidator: {
			openLibraryWorkKey: { type: "string", min: 1 },
			title: { type: "string", min: 1 },
			author: { type: "string", optional: true },
			publishYear: { type: "number", integer: true, optional: true },
			coverId: { type: "number", integer: true, optional: true },
			coverImageBase64: { type: "string", optional: true },
			coverMimeType: { type: "string", optional: true }
		}
	},

	actions: {
		// Agrega o actualiza (por usuario+workKey) y garantiza tope 5
		add: {
			params: {
				openLibraryWorkKey: "string|min:1",
				title: "string|min:1",
				author: { type: "string", optional: true },
				publishYear: { type: "number", integer: true, optional: true },
				coverId: { type: "number", integer: true, optional: true },
				coverImageBase64: { type: "string", optional: true },
				coverMimeType: { type: "string", optional: true }
			},
			async handler(ctx) {
				const username = ctx.meta.user && ctx.meta.user.username;
				if (!username) throw new Error("Usuario no autenticado");
				const doc = {
					username,
					openLibraryWorkKey: ctx.params.openLibraryWorkKey,
					title: ctx.params.title,
					author: ctx.params.author,
					publishYear: ctx.params.publishYear,
					coverId: ctx.params.coverId,
					coverImageBase64: ctx.params.coverImageBase64,
					coverMimeType: ctx.params.coverMimeType,
					createdAt: new Date()
				};
				const existing = await this.adapter.findOne({ username, openLibraryWorkKey: doc.openLibraryWorkKey });
				if (existing) {
					await this.adapter.updateById(existing._id, { $set: { ...doc } });
				} else {
					await this.adapter.insert(doc);
				}
				// Mantener solo 5 recientes por usuario
				const list = await this.adapter.find({ query: { username }, sort: ["-createdAt"] });
				if (list.length > 5) {
					const toRemove = list.slice(5);
					await Promise.all(toRemove.map(r => this.adapter.removeById(r._id)));
				}
				return { ok: true };
			}
		},

		// Lista los recientes del usuario (máx 5, más reciente primero)
		list: {
			rest: "GET /list",
			async handler(ctx) {
				const username = ctx.meta.user && ctx.meta.user.username;
				if (!username) throw new Error("Usuario no autenticado");
				const list = await this.adapter.find({ query: { username }, sort: ["-createdAt"], limit: 5 });
				return list.map(d => ({
					id: String(d._id),
					openLibraryWorkKey: d.openLibraryWorkKey,
					title: d.title,
					author: d.author,
					publishYear: d.publishYear ?? null,
					coverId: d.coverId,
					coverImageBase64: d.coverImageBase64,
					coverMimeType: d.coverMimeType,
					createdAt: d.createdAt
				}));
			}
		}
	},

	async afterConnected() {
		this.logger.info("Conectado a DB (collection 'recents')");
	}
};


