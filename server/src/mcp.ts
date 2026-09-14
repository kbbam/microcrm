import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { z } from "zod";
import * as crm from "./crm.js";

// Matches the shape the microcrm UI actually renders (see template.html's
// renderContacts): {type, value, label}. A tool caller (any agent, in any
// chat) that invents a different shape -- {name, phone, note, ...} has
// actually happened -- produces a contact entry the UI silently can't
// display, so this is enforced here rather than left to prose in the tool
// description.
const contactSchema = z.object({
  type: z.enum(["phone", "email", "website", "whatsapp", "other"]),
  value: z.string(),
  label: z.string().optional(),
});

function buildServer(): McpServer {
  const server = new McpServer({ name: "microcrm", version: "0.1.0" });

  server.tool(
    "search_entities",
    "Search organizations/pharmacy locations by name, type, lead tier, or cannabis status. " +
      "Pass fields:'summary' for a lightweight listing (id/name/type/city/country/lead_tier/" +
      "cannabis_status only) when you don't need full detail on every match -- e.g. fetching " +
      "many rows at once. Follow up with get_entity for full detail on the one you actually need.",
    {
      query: z.string().optional().describe("Case-insensitive substring match on name"),
      type: z.enum(["organization", "pharmacy_location", "person"]).optional(),
      lead_tier: z.enum(["high", "medium", "watch", "unscored"]).optional(),
      cannabis_status: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      fields: z.enum(["summary", "full"]).optional().describe("Default 'full'"),
    },
    async ({ query, type, lead_tier, cannabis_status, limit, fields }) => {
      const results = await crm.searchEntities({
        query,
        type,
        leadTier: lead_tier,
        cannabisStatus: cannabis_status,
        limit,
        summary: fields === "summary",
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_entity",
    "Fetch one organization/pharmacy-location record by id.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await crm.getEntity(id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "update_entity",
    "Update one entity. Pass only the fields you want to change. `contacts` " +
      "REPLACES the entire contacts list (fetch get_entity first if you're " +
      "adding to existing contacts rather than replacing them) -- each one " +
      "must be {type, value, label?}, type one of phone/email/website/" +
      "whatsapp/other. `add_note` appends a timestamped free-text line to " +
      "this entity's notes (e.g. a meeting summary) rather than replacing " +
      "them -- use this for narrative/CRM-activity info, not the structured " +
      "fields.",
    {
      id: z.number().int(),
      lead_tier: z.enum(["high", "medium", "watch", "unscored"]).optional(),
      bam_fit: z.string().optional(),
      commercial_position: z.string().optional(),
      commercial_role: z.string().optional(),
      cannabis_status: z.string().optional(),
      cannabis_relevance_status: z.string().optional(),
      cannabis_evidence_strength: z.string().optional(),
      contacts: z.array(contactSchema).optional(),
      add_note: z.string().optional().describe("Appended, not a replacement"),
    },
    async ({ id, add_note, ...fields }) => {
      const patch = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(patch).length === 0 && !add_note) {
        return {
          content: [{ type: "text", text: "No fields provided to update." }],
          isError: true,
        };
      }
      let result = Object.keys(patch).length > 0 ? await crm.updateEntity(id, patch) : await crm.getEntity(id);
      if (!result) {
        return { content: [{ type: "text", text: `No entity with id ${id}.` }], isError: true };
      }
      if (add_note) {
        result = await crm.appendEntityNote(id, add_note);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "search_people",
    "Search people by name. Pass fields:'summary' for a lightweight listing " +
      "(id/name/roles/resolution_status only). Follow up with get_person for full detail.",
    {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
      fields: z.enum(["summary", "full"]).optional().describe("Default 'full'"),
    },
    async ({ query, limit, fields }) => {
      const results = await crm.searchPeople({ query, limit, summary: fields === "summary" });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_person",
    "Fetch one person record by id.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await crm.getPerson(id);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "update_person",
    "Update one person. `contacts` REPLACES the entire contacts list (fetch " +
      "get_person first if you're adding to existing contacts rather than " +
      "replacing them) -- each one must be {type, value, label?}, type one " +
      "of phone/email/website/whatsapp/other. `add_note` appends a " +
      "timestamped free-text line to this person's notes (e.g. a meeting " +
      "summary) rather than replacing them.",
    {
      id: z.number().int(),
      contacts: z.array(contactSchema).optional(),
      add_note: z.string().optional().describe("Appended, not a replacement"),
    },
    async ({ id, add_note, ...fields }) => {
      const patch = Object.fromEntries(
        Object.entries(fields).filter(([, v]) => v !== undefined),
      );
      if (Object.keys(patch).length === 0 && !add_note) {
        return {
          content: [{ type: "text", text: "No fields provided to update." }],
          isError: true,
        };
      }
      let result = Object.keys(patch).length > 0 ? await crm.updatePerson(id, patch) : await crm.getPerson(id);
      if (!result) {
        return { content: [{ type: "text", text: `No person with id ${id}.` }], isError: true };
      }
      if (add_note) {
        result = await crm.appendPersonNote(id, add_note);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  return server;
}

// Stateless mode: a fresh McpServer + transport per request, so there's no
// session/connection state to keep alive between calls. Simple, and fine at
// this traffic scale (a handful of teammates hitting a lead database).
export async function handleMcpRequest(req: Request, res: Response) {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
