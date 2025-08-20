"use strict";

const DbMixin = require("../mixins/db.mixin");
const bcrypt = require("bcryptjs");

/** @type {import('moleculer').ServiceSchema} */
module.exports = {
	name: "users",
	mixins: [DbMixin("users")],

	settings: {
		fields: ["_id", "username", "createdAt"],
		entityValidator: {
			username: "string|min:3",
			password: { type: "string", min: 3 }
		}
	},

	actions: {
		register: {
			rest: "POST /auth/register",
			params: { username: "string|min:3", password: "string|min:3" },
			async handler(ctx) {
				const { username, password } = ctx.params;
				const exists = await this.adapter.findOne({ username });
				if (exists) {
					ctx.meta.$statusCode = 409;
					return { error: "USERNAME_TAKEN", message: "Nombre de usuario no disponible" };
				}
				const hash = await bcrypt.hash(password, 10);
				const doc = await this.adapter.insert({ username, passwordHash: hash, createdAt: new Date() });
				return { ok: true, userId: String(doc._id) };
			}
		},

		// Valida credenciales contra DB para Basic login
		validateBasic: {
			params: { username: "string", password: "string" },
			async handler(ctx) {
				const { username, password } = ctx.params;
				const user = await this.adapter.findOne({ username });
				if (!user || !user.passwordHash) return false;
				return bcrypt.compare(password, user.passwordHash);
			}
		}
	}
};



