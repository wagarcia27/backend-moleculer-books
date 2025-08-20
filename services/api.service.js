"use strict";

const ApiGateway = require("moleculer-web");

/**
 * @typedef {import('moleculer').ServiceSchema} ServiceSchema Moleculer's Service Schema
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 * @typedef {import('http').IncomingMessage} IncomingRequest Incoming HTTP Request
 * @typedef {import('http').ServerResponse} ServerResponse HTTP Server Response
 * @typedef {import('moleculer-web').ApiSettingsSchema} ApiSettingsSchema API Setting Schema
 */

module.exports = {
	name: "api",
	mixins: [ApiGateway],

	/** @type {ApiSettingsSchema} More info about settings: https://moleculer.services/docs/0.14/moleculer-web.html */
	settings: {
		// Exposed port
		port: process.env.PORT || 3000,

		// Exposed IP
		ip: "0.0.0.0",

		// Global Express middlewares. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Middlewares
		use: [],

		routes: [
			{
				path: "/api",

				whitelist: [
					"**"
				],

				// Route-level Express middlewares. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Middlewares
				use: [],

				// CORS configuration
				cors: {
					origin: ["*"],
					methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
					allowedHeaders: ["Content-Type", "Authorization"],
					exposedHeaders: ["Authorization"],
					credentials: true,
					maxAge: 3600
				},

				// Enable/disable parameter merging method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Disable-merging
				mergeParams: true,

				// Enable authentication. Implement the logic into `authenticate` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authentication
				authentication: true,

				// Enable authorization. Implement the logic into `authorize` method. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Authorization
				authorization: false,

				// The auto-alias feature allows you to declare your route alias directly in your services.
				// The gateway will dynamically build the full routes from service schema.
				autoAliases: true,

				aliases: {
					// Registrar selección de un libro como "reciente" del usuario.
					"POST /books/recent": "recents.add",
					// Alias explícito para mantener /api/auth/register
					"POST /auth/register": "users.register",
					// Endpoint de login para clientes que esperan una ruta específica.
					// Valida credenciales Basic contra DB y devuelve 200 si son correctas.
					"GET /auth/login": async (req, res) => {
						try {
							const header = req.headers["authorization"] || "";
							if (!header.startsWith("Basic ")) {
								res.statusCode = 401;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "NO_TOKEN" }));
							}
							const token = header.substring(6);
							const userpass = Buffer.from(token, "base64").toString();
							const idx = userpass.indexOf(":");
							if (idx === -1) {
								res.statusCode = 400;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "INVALID_FORMAT" }));
							}
							const username = userpass.slice(0, idx);
							const password = userpass.slice(idx + 1);
							const ok = await req.$service.broker.call("users.validateBasic", { username, password });
							if (!ok) {
								res.statusCode = 401;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "INVALID_CREDENTIALS" }));
							}
							// Echo del header Authorization para que el front pueda almacenarlo si lo necesita
							res.statusCode = 200;
							res.setHeader("Authorization", header);
							res.setHeader("Content-Type", "application/json");
							return res.end(JSON.stringify({ ok: true, username, token: header }));
						} catch (err) {
							res.statusCode = 500;
							res.setHeader("Content-Type", "application/json");
							return res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
						}
					},
					// Whoami: valida header Basic y devuelve el usuario
					"GET /auth/whoami": async (req, res) => {
						try {
							const header = req.headers["authorization"] || "";
							if (!header.startsWith("Basic ")) {
								res.statusCode = 401;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "NO_TOKEN" }));
							}
							const token = header.substring(6);
							const userpass = Buffer.from(token, "base64").toString();
							const idx = userpass.indexOf(":");
							if (idx === -1) {
								res.statusCode = 400;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "INVALID_FORMAT" }));
							}
							const username = userpass.slice(0, idx);
							const password = userpass.slice(idx + 1);
							const ok = await req.$service.broker.call("users.validateBasic", { username, password });
							if (!ok) {
								res.statusCode = 401;
								res.setHeader("Content-Type", "application/json");
								return res.end(JSON.stringify({ error: "INVALID_CREDENTIALS" }));
							}
							res.statusCode = 200;
							res.setHeader("Content-Type", "application/json");
							return res.end(JSON.stringify({ ok: true, username }));
						} catch (err) {
							res.statusCode = 500;
							res.setHeader("Content-Type", "application/json");
							return res.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
						}
					}
				},

				/**
				 * Before call hook. You can check the request.
				 * @param {Context} ctx
				 * @param {Object} route
				 * @param {IncomingRequest} req
				 * @param {ServerResponse} res
				 * @param {Object} data
				 */
				onBeforeCall(ctx, route, req, res) {
					// Guardar inicio para medir duración
					req.$startTime = Date.now();
					ctx.meta.userAgent = req.headers["user-agent"];
				},

				/**
				 * After call hook. You can modify the data.
				 * @param {Context} ctx
				 * @param {Object} route
				 * @param {IncomingRequest} req
				 * @param {ServerResponse} res
				 * @param {Object} data
 				 */
				onAfterCall(ctx, route, req, res, data) {
					const elapsed = Date.now() - (req.$startTime || Date.now());
					const url = req.originalUrl || req.url || "";
					const user = (ctx.meta && ctx.meta.user && ctx.meta.user.username) || "-";
					const status = res && res.statusCode ? res.statusCode : 200;
					this.logger.info(`${req.method} ${url} ${status} ${elapsed}ms user=${user}`);
					return data;
				},

				// Hook de error para loguear fallos de endpoints
				onError(req, res, err) {
					// Importante: NO llamar a this.sendError aquí para evitar recursión.
					try {
						const elapsed = Date.now() - (req.$startTime || Date.now());
						const url = req.originalUrl || req.url || "";
						const status = (err && (err.code || err.status)) || (res && res.statusCode) || 500;
						this.logger.warn(`${req.method} ${url} ${status} ${elapsed}ms error=${err && err.name}:${err && err.message}`);
						res.statusCode = status;
						res.setHeader("Content-Type", "application/json");
						const body = { code: status, name: (err && err.name) || "Error", message: (err && err.message) || "Error" };
						return res.end(JSON.stringify(body));
					} catch (_) {
						try {
							res.statusCode = 500;
							res.setHeader("Content-Type", "application/json");
							return res.end(JSON.stringify({ code: 500, name: "Error", message: "INTERNAL_ERROR" }));
						} catch { /* ignore */ }
					}
				},

				// Calling options. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Calling-options
				callOptions: {},

				bodyParsers: {
					json: {
						strict: false,
						limit: "1MB"
					},
					urlencoded: {
						extended: true,
						limit: "1MB"
					}
				},

				// Mapping policy setting. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Mapping-policy
				mappingPolicy: "all", // Available values: "all", "restrict"

				// Enable/disable logging
				logging: true
			}
		],

		// Do not log client side errors (does not log an error response when the error.code is 400<=X<500)
		log4XXResponses: false,
		// Logging the request parameters. Set to any log level to enable it. E.g. "info"
		logRequestParams: null,
		// Logging the response data. Set to any log level to enable it. E.g. "info"
		logResponseData: null,


		// Serve assets from "public" folder. More info: https://moleculer.services/docs/0.14/moleculer-web.html#Serve-static-files
		assets: {
			folder: "public",

			// Options to `server-static` module
			options: {}
		}
	},

	methods: {

		/**
		 * Authenticate the request. It check the `Authorization` token value in the request header.
		 * Check the token value & resolve the user by the token.
		 * The resolved user will be available in `ctx.meta.user`
		 *
		 * PLEASE NOTE, IT'S JUST AN EXAMPLE IMPLEMENTATION. DO NOT USE IN PRODUCTION!
		 *
		 * @param {Context} ctx
		 * @param {Object} route
		 * @param {IncomingRequest} req
		 * @returns {Promise}
		 */
		async authenticate(ctx, route, req) {
			const url = req.originalUrl || req.url || "";
			// Rutas públicas (solo lectura o registro de usuario)
			if (
				url.startsWith("/api/books/front-cover") ||
				url.startsWith("/api/books/library/front-cover") ||
				url.startsWith("/api/docs") ||
				url.startsWith("/api/auth/login") ||
				url.startsWith("/api/auth/register") ||
				url.startsWith("/api/auth/whoami") ||
				url.startsWith("/api/greeter/hello")
			) {
				return null;
			}
			const header = req.headers["authorization"] || "";
			if (!header.startsWith("Basic ")) {
				throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_NO_TOKEN);
			}
			const token = header.substring(6);
			const userpass = Buffer.from(token, "base64").toString();
			const idx = userpass.indexOf(":");
			if (idx === -1) throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN);
			const username = userpass.slice(0, idx);
			const password = userpass.slice(idx + 1);

			// 1) Intentar validar contra DB
			try {
				const ok = await ctx.broker.call("users.validateBasic", { username, password });
				if (ok) return { username };
			} catch (_) {}

			// Si no valida contra DB, no permitir acceso
			throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN);
		},

		/**
		 * Authorize the request. Check that the authenticated user has right to access the resource.
		 *
		 * PLEASE NOTE, IT'S JUST AN EXAMPLE IMPLEMENTATION. DO NOT USE IN PRODUCTION!
		 *
		 * @param {Context} ctx
		 * @param {Object} route
		 * @param {IncomingRequest} req
		 * @returns {Promise}
		 */
		async authorize(ctx, route, req) {
			// Get the authenticated user.
			const user = ctx.meta.user;

			// It check the `auth` property in action schema.
			if (req.$action.auth == "required" && !user) {
				throw new ApiGateway.Errors.UnAuthorizedError("NO_RIGHTS");
			}
		}

	}
};
