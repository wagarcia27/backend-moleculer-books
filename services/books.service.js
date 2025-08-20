"use strict";

const DbMixin = require("../mixins/db.mixin");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema
 * @typedef {import('moleculer').Context} Context
 */

/** @type {ServiceSchema} */
module.exports = {
	name: "books",
	mixins: [DbMixin("books")],

	settings: {
		fields: [
			"_id",
			"username",
			"title",
			"author",
			"publishYear",
			"openLibraryWorkKey",
			"coverId",
			"coverImageBase64",
			"coverMimeType",
			"review",
			"rating",
			"createdAt",
			"updatedAt"
		],
		entityValidator: {
			title: "string|min:1",
			author: { type: "string", optional: true },
			publishYear: { type: "number", integer: true, optional: true },
			openLibraryWorkKey: { type: "string", optional: true },
			coverId: { type: "number", integer: true, optional: true },
			coverImageBase64: { type: "string", optional: true },
			coverMimeType: { type: "string", optional: true },
			review: { type: "string", optional: true, min: 0, max: 5000 },
			rating: { type: "number", integer: true, min: 1, max: 5, optional: true }
		}
	},

	actions: {
		/**
		 * GET /api/books/search?q=Term
		 * Integra con OpenLibrary y retorna hasta 10 resultados.
		 */
		search: {
			rest: {
				method: "GET",
				path: "/search"
			},
			params: {
				q: { type: "string", min: 1 }
			},
			/** @param {Context} ctx */
			async handler(ctx) {
				const query = ctx.params.q;
				// Guarda la búsqueda por usuario
				try { await ctx.call("searches.add", { term: query }); } catch (err) { this.logger.warn("No se pudo guardar la búsqueda", err.message); }
				return this.buildSearchResults(ctx, query);
			}
		},

		/**
		 * GET /api/books/home
		 * Devuelve los 10 resultados de la última búsqueda del usuario autenticado.
		 */
		home: {
			rest: "GET /home",
			async handler(ctx) {
				let term = null;
				try {
					const list = await ctx.call("searches.last");
					if (Array.isArray(list) && list.length > 0) term = list[0].term;
				} catch (_) {}
				if (!term) return [];
				return this.buildSearchResults(ctx, term);
			}
		},

		/**
		 * GET /api/books/last-search
		 */
		lastSearch: {
			rest: "GET /last-search",
			async handler(ctx) {
				return ctx.call("searches.last");
			}
		},

		/**
		 * POST /api/books/my-library
		 * Guarda un libro en "mi biblioteca". Si no viene la portada en base64 pero
		 * hay `coverId`, la descarga desde OpenLibrary.
		 */
		createInLibrary: {
			rest: {
				method: "POST",
				path: "/my-library"
			},
			params: {
				title: "string|min:1",
				author: { type: "string", optional: true },
				publishYear: { type: "number", integer: true, optional: true },
				openLibraryWorkKey: { type: "string", optional: true },
				coverId: { type: "number", integer: true, optional: true },
				coverImageBase64: { type: "string", optional: true },
				review: { type: "string", optional: true, min: 0, max: 5000 },
				rating: { type: "number", integer: true, min: 1, max: 5, optional: true }
			},
			/** @param {Context} ctx */
			async handler(ctx) {
				const payload = { ...ctx.params };
				const username = ctx.meta.user && ctx.meta.user.username;
				if (!username) throw new Error("Usuario no autenticado");
				payload.username = username;
				if (!payload.coverImageBase64 && payload.coverId) {
					const imgUrl = `https://covers.openlibrary.org/b/id/${payload.coverId}-L.jpg`;
					try {
						const r = await fetch(imgUrl);
						if (r.ok) {
							const arrayBuffer = await r.arrayBuffer();
							payload.coverImageBase64 = Buffer.from(arrayBuffer).toString("base64");
							payload.coverMimeType = r.headers.get("content-type") || "image/jpeg";
						}
					} catch(err) {
						this.logger.warn("No se pudo descargar la portada desde OpenLibrary", err.message);
					}
				}
				if (payload.publishYear == null && payload.openLibraryWorkKey) {
					try {
						const year = await this.resolvePublishYearFromOpenLibrary(payload.openLibraryWorkKey);
						if (year) payload.publishYear = year;
					} catch (err) {
						this.logger.warn("No se pudo resolver publishYear desde OpenLibrary", err.message);
					}
				}
				payload.createdAt = new Date();
				payload.updatedAt = new Date();
				const doc = await this.adapter.insert(payload);
				return await this.transformDocuments(ctx, ctx.params, doc);
			}
		},

		/**
		 * GET /api/books/my-library/:id
		 */
		getFromLibrary: {
			rest: "GET /my-library/:id",
			params: { id: "string" },
			async handler(ctx) {
				let doc = await this.adapter.findById(ctx.params.id);
				if (!doc) throw new Error("Libro no encontrado");
				// Restringir acceso a dueño
				const username = ctx.meta.user && ctx.meta.user.username;
				if (username && doc.username && doc.username !== username) {
					throw new Error("Libro no encontrado");
				}
				// Enriquecer publishYear en caso de faltar
				doc = await this.ensurePublishYear(doc);
				const json = await this.transformDocuments(ctx, ctx.params, doc);
				return {
					...json,
					_id: String(json._id),
					publishYear: json.publishYear ?? null,
					coverImageBase64: json.coverImageBase64,
					coverMimeType: json.coverMimeType || "image/jpeg",
					coverUrl: json.coverImageBase64 ? `/api/books/front-cover/${json._id}` : (json.coverId ? `https://covers.openlibrary.org/b/id/${json.coverId}-M.jpg` : null)
				};
			}
		},

		/**
		 * PUT /api/books/my-library/:id
		 * Actualiza review y calificación
		 */
		updateLibrary: {
			rest: "PUT /my-library/:id",
			params: {
				id: "string",
				review: { type: "string", optional: true, min: 0, max: 5000 },
				rating: { type: "number", integer: true, min: 1, max: 5, optional: true }
			},
			async handler(ctx) {
				const update = { ...ctx.params };
				delete update.id;
				update.updatedAt = new Date();
				// Asegurar ownership
				const username = ctx.meta.user && ctx.meta.user.username;
				const current = await this.adapter.findById(ctx.params.id);
				if (!current || (username && current.username && current.username !== username)) {
					throw new Error("Libro no encontrado");
				}
				const doc = await this.adapter.updateById(ctx.params.id, { $set: update });
				const json = await this.transformDocuments(ctx, ctx.params, doc);
				await this.entityChanged("updated", json, ctx);
				return json;
			}
		},

		/**
		 * DELETE /api/books/my-library/:id
		 */
		removeFromLibrary: {
			rest: "DELETE /my-library/:id",
			params: { id: "string" },
			async handler(ctx) {
				const username = ctx.meta.user && ctx.meta.user.username;
				const current = await this.adapter.findById(ctx.params.id);
				if (!current || (username && current.username && current.username !== username)) {
					throw new Error("Libro no encontrado");
				}
				await this.adapter.removeById(ctx.params.id);
				return { ok: true };
			}
		},

		/**
		 * GET /api/books/my-library
		 * Lista con filtros: q (título o autor), author, hasReview=true|false
		 */
		listLibrary: {
			rest: "GET /my-library",
			params: {
				q: { type: "string", optional: true },
				author: { type: "string", optional: true },
				hasReview: { type: "string", optional: true },
				sort: { type: "string", optional: true }
			},
			async handler(ctx) {
				const query = {};
				// Scope por usuario
				const username = ctx.meta.user && ctx.meta.user.username;
				if (username) query.username = username;

				if (ctx.params.q) {
					const regex = new RegExp(ctx.params.q, "i");
					query.$or = [ { title: regex }, { author: regex } ];
				}
				if (ctx.params.author) {
					query.author = new RegExp(ctx.params.author, "i");
				}
				const onlyWithReview = ctx.params.hasReview === true || ctx.params.hasReview === "true";
				if (onlyWithReview) query.review = { $exists: true, $ne: "" };
				// Ordenamiento opcional: sort=field:asc|desc
				let sortArray = ["-updatedAt"];
				if (typeof ctx.params.sort === "string") {
					const [rawField, rawDir] = ctx.params.sort.split(":");
					const field = (rawField || "").trim();
					const dir = (rawDir || "desc").trim().toLowerCase();
					const allowed = new Set(["updatedAt", "createdAt", "title", "author", "rating", "publishYear"]);
					if (allowed.has(field)) {
						sortArray = [dir === "asc" ? field : `-${field}`];
					}
				}
				const list = await this.adapter.find({ query, sort: sortArray });
				const enriched = await Promise.all(list.map(doc => this.ensurePublishYear(doc)));
				return enriched.map(doc => ({
					_id: String(doc._id),
					title: doc.title,
					author: doc.author,
					publishYear: doc.publishYear ?? null,
					rating: doc.rating,
					review: doc.review,
					coverImageBase64: doc.coverImageBase64,
					coverMimeType: doc.coverMimeType || "image/jpeg",
					coverUrl: doc.coverImageBase64 ? `/api/books/front-cover/${doc._id}` : (doc.coverId ? `https://covers.openlibrary.org/b/id/${doc.coverId}-M.jpg` : null)
				}));
			}
		},

		/**
		 * GET /api/books/front-cover/:id -> devuelve la imagen de portada guardada (base64)
		 */
		frontCover: {
			rest: "GET /front-cover/:id",
			params: { id: "string" },
			async handler(ctx) {
				const doc = await this.adapter.findById(ctx.params.id);
				if (!doc) {
					ctx.meta.$statusCode = 404;
					return "Not found";
				}
				if (doc.coverImageBase64) {
					ctx.meta.$responseType = doc.coverMimeType || "image/jpeg";
					return Buffer.from(doc.coverImageBase64, "base64");
				}
				// Fallback: intentar descargar desde OpenLibrary, guardar y devolver
				if (doc.coverId) {
					try {
						const r = await fetch(`https://covers.openlibrary.org/b/id/${doc.coverId}-L.jpg`);
						if (r.ok) {
							const arrayBuffer = await r.arrayBuffer();
							const b64 = Buffer.from(arrayBuffer).toString("base64");
							const mime = r.headers.get("content-type") || "image/jpeg";
							await this.adapter.updateById(doc._id, { $set: { coverImageBase64: b64, coverMimeType: mime, updatedAt: new Date() } });
							ctx.meta.$responseType = mime;
							return Buffer.from(b64, "base64");
						}
					} catch (err) {
						this.logger.warn("Fallback de portada falló", err.message);
					}
				}
				// Último recurso: devolver un PNG 1x1 para no romper la UI
				ctx.meta.$responseType = "image/png";
				return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64");
			}
		},

		// Alias para cumplir literalmente con el texto del requerimiento
		frontCoverLibraryAlias: {
			rest: "GET /library/front-cover/:id",
			params: { id: "string" },
			async handler(ctx) {
				return this.actions.frontCover.handler.call(this, ctx);
			}
		}
	},

	methods: {
		async buildSearchResults(ctx, term) {
			const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&limit=10`;
			const res = await fetch(url);
			if (!res.ok) throw new Error("OpenLibrary no disponible");
			const data = await res.json();

			const docs = Array.isArray(data.docs) ? data.docs : [];
			const results = docs.slice(0, 10).map(doc => ({
				workKey: doc.key,
				title: doc.title,
				author: Array.isArray(doc.author_name) && doc.author_name.length > 0 ? doc.author_name[0] : undefined,
				publishYear: doc.first_publish_year,
				coverId: doc.cover_i
			}));

			// Marcar guardados según el usuario autenticado
			const workKeys = results.filter(r => !!r.workKey).map(r => r.workKey);
			let saved = [];
			if (workKeys.length > 0) {
				const username = ctx.meta.user && ctx.meta.user.username;
				const query = { openLibraryWorkKey: { $in: workKeys } };
				if (username) query.username = username;
				saved = await this.adapter.find({ query });
			}

			const savedByKey = new Map(saved.map(b => [b.openLibraryWorkKey, b]));

			return results.map(r => {
				const savedBook = savedByKey.get(r.workKey);
				const coverUrl = savedBook && savedBook.coverImageBase64 ? `/api/books/front-cover/${savedBook._id}` : (r.coverId ? `https://covers.openlibrary.org/b/id/${r.coverId}-M.jpg` : null);
				return {
					id: r.workKey,
					title: r.title,
					author: r.author,
					publishYear: r.publishYear,
					coverUrl,
					saved: !!savedBook,
					savedId: savedBook ? String(savedBook._id) : null
				};
			});
		},
		async ensurePublishYear(doc) {
			try {
				if (doc && (doc.publishYear == null || doc.publishYear === undefined)) {
					let resolved = null;
					if (doc.openLibraryWorkKey) {
						resolved = await this.resolvePublishYearFromOpenLibrary(doc.openLibraryWorkKey);
					}
					if (!resolved && (doc.title || doc.author)) {
						// Buscar por título y autor para inferir año
						const q = [doc.title, doc.author ? `author:${doc.author}` : null].filter(Boolean).join(" ");
						const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=1`);
						if (res.ok) {
							const j = await res.json();
							if (Array.isArray(j.docs) && j.docs[0] && j.docs[0].first_publish_year) {
								resolved = Number(j.docs[0].first_publish_year);
							}
						}
					}
					if (resolved) {
						await this.adapter.updateById(doc._id, { $set: { publishYear: resolved, updatedAt: new Date() } });
						doc.publishYear = resolved;
					}
				}
			} catch (_) {}
			return doc;
		},
		async resolvePublishYearFromOpenLibrary(workKey) {
			try {
				const base = "https://openlibrary.org";
				const wr = await fetch(`${base}${workKey}.json`);
				if (wr.ok) {
					const wj = await wr.json();
					if (wj.first_publish_year) return Number(wj.first_publish_year);
					if (wj.first_publish_date) {
						const y = this.extractYear(wj.first_publish_date);
						if (y) return y;
					}
				}
				const er = await fetch(`${base}${workKey}/editions.json?limit=1`);
				if (er.ok) {
					const ej = await er.json();
					const edition = Array.isArray(ej.entries) && ej.entries.length > 0 ? ej.entries[0] : null;
					if (edition && edition.publish_date) {
						const y = this.extractYear(edition.publish_date);
						if (y) return y;
					}
				}
			} catch (_) {}
			return null;
		},
		extractYear(value) {
			if (!value) return null;
			if (typeof value === "number") return value;
			const m = String(value).match(/(\d{4})/);
			return m ? Number(m[1]) : null;
		}
	},

	async started() {},
	async stopped() {},

	/**
	 * Se dispara después de establecer conexión con la DB (moleculer-db)
	 */
	async afterConnected() {
		this.logger.info("Conectado a MongoDB (collection 'books')");
	}
};


