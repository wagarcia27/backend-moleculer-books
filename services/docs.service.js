"use strict";

/**
 * Servicio de documentación: expone OpenAPI y una UI simple
 */

module.exports = {
	name: "docs",

	actions: {
		openapi: {
			rest: "GET /docs/openapi.json",
			async handler() {
				return {
					openapi: "3.0.3",
					info: { title: "Book Reviews API", version: "1.0.0" },
					servers: [ { url: "/api" } ],
					paths: {
						"/books/search": {
							get: {
								summary: "Buscar libros en OpenLibrary",
								parameters: [ { name: "q", in: "query", required: true, schema: { type: "string" } } ],
								responses: { "200": { description: "OK" } }
							}
						},
						"/books/last-search": { get: { summary: "Últimas 5 búsquedas", responses: { "200": { description: "OK" } } } },
						"/books/my-library": {
							get: { summary: "Listar mi biblioteca", responses: { "200": { description: "OK" } } },
							post: { summary: "Guardar libro", responses: { "200": { description: "OK" } } }
						},
						"/books/my-library/{id}": {
							get: { summary: "Obtener libro", parameters: [ { name: "id", in: "path", required: true, schema: { type: "string" } } ], responses: { "200": { description: "OK" } } },
							put: { summary: "Actualizar libro", parameters: [ { name: "id", in: "path", required: true, schema: { type: "string" } } ], responses: { "200": { description: "OK" } } },
							delete: { summary: "Eliminar libro", parameters: [ { name: "id", in: "path", required: true, schema: { type: "string" } } ], responses: { "200": { description: "OK" } } }
						},
						"/books/front-cover/{id}": { get: { summary: "Portada del libro", parameters: [ { name: "id", in: "path", required: true, schema: { type: "string" } } ], responses: { "200": { description: "OK" } } } }
					}
				};
			}
		},

		ui: {
			rest: "GET /docs",
			async handler() {
				// UI mínima basada en Swagger UI CDN
				return `<!doctype html><html><head><meta charset=\"utf-8\"/><title>API Docs</title>
				<link rel=\"stylesheet\" href=\"https://unpkg.com/swagger-ui-dist@5/swagger-ui.css\" />
				</head><body>
				<div id=\"swagger\"></div>
				<script src=\"https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js\"></script>
				<script>SwaggerUIBundle({url:'/api/docs/openapi.json', dom_id:'#swagger'});</script>
				</body></html>`;
			}
		}
	}
};


