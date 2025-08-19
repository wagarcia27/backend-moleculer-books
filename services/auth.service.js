"use strict";

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
	name: "auth",

	actions: {
		// Registro vía auth (proxy a users.register)
		register: {
			rest: "POST /auth/register",
			params: { username: "string|min:3", password: "string|min:3" },
			async handler(ctx) {
				return ctx.call("users.register", ctx.params);
			}
		},

		// Verifica credenciales Basic y devuelve el usuario
		login: {
			rest: "GET /auth/login",
			async handler(ctx) {
				// Si llegó aquí es porque pasó authenticate() del gateway
				return { ok: true, user: ctx.meta.user };
			}
		},

		// Alias más semántico para consultas del front
		whoami: {
			rest: "GET /auth/whoami",
			async handler(ctx) {
				return { ok: true, user: ctx.meta.user };
			}
		},

		// Para Basic Auth, logout es lógico en el cliente (borrar credenciales)
		logout: {
			rest: "POST /auth/logout",
			async handler() {
				return { ok: true };
			}
		}
	}
};


