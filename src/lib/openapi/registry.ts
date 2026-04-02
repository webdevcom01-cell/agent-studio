/**
 * OpenAPI registry singleton.
 *
 * Calls extendZodWithOpenApi(z) once here so every schema defined inside
 * this module can use the .openapi() method.  Import { z } from here
 * (not from "zod") whenever you need Zod inside the openapi module.
 */
import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export { z };
export const registry = new OpenAPIRegistry();
