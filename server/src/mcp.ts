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
  value: z.string().trim().min(1).max(500),
  label: z.string().trim().min(1).max(100).optional(),
});

function buildServer(actorEmail: string): McpServer {
  const server = new McpServer({ name: "microcrm", version: "0.1.0" });

  server.tool(
    "create_entity",
    "Create an organization or pharmacy that does not already exist. Search first. " +
      "An exact name-and-city match is returned instead of creating a duplicate.",
    {
      name: z.string().trim().min(1).max(300),
      type: z.enum(["organization", "pharmacy_location"]),
      city: z.string().trim().min(1).max(200).optional(),
      country: z.string().trim().min(1).max(200).optional(),
      website: z.string().trim().url().max(500).optional(),
      lead_tier: z.enum(["high", "medium", "watch", "unscored"]).optional(),
      contacts: z.array(contactSchema).max(20).optional(),
    },
    async ({ name, type, city, country, website, lead_tier, contacts }) => {
      const result = await crm.createEntity({
        name,
        type,
        city,
        country,
        website,
        leadTier: lead_tier,
        contacts,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "capture_lead_interaction",
    "Capture a business card or meeting in one transaction. Search the organization first " +
      "and pass organization_id when known. This matches an existing person by exact name " +
      "within that organization or creates them, merges new contacts without replacing old " +
      "ones, maintains the person/company link in both records, and records an attributed " +
      "activity plus optional follow-up. Use the colleague's actual meeting time and timezone " +
      "when known; otherwise occurred_at defaults to now.",
    {
      person_name: z.string().trim().min(1).max(300),
      organization_id: z.number().int().positive().optional(),
      title: z.string().trim().min(1).max(200).optional(),
      role_function: z.string().trim().min(1).max(300).optional(),
      contacts: z.array(contactSchema).max(20).optional(),
      linkedin_url: z.string().trim().url().max(500).optional(),
      summary: z.string().trim().min(1).max(5000),
      occurred_at: z.string().datetime({ offset: true }).optional(),
      next_action: z.string().trim().min(1).max(1000).optional(),
      next_action_at: z.string().datetime({ offset: true }).optional(),
    },
    async ({
      person_name,
      organization_id,
      title,
      role_function,
      contacts,
      linkedin_url,
      summary,
      occurred_at,
      next_action,
      next_action_at,
    }) => {
      try {
        const result = await crm.captureLeadInteraction({
          personName: person_name,
          organizationId: organization_id,
          title,
          roleFunction: role_function,
          contacts,
          linkedinUrl: linkedin_url,
          summary,
          occurredAt: occurred_at,
          nextAction: next_action,
          nextActionAt: next_action_at,
          actorEmail,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [{
            type: "text",
            text: err instanceof Error ? err.message : "Could not capture lead interaction.",
          }],
          isError: true,
        };
      }
    },
  );

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
      city: z.string().trim().min(1).max(200).optional(),
      country: z.string().trim().min(1).max(200).optional(),
      website: z.string().trim().url().max(500).optional(),
      lead_tier: z.enum(["high", "medium", "watch", "unscored"]).optional(),
      bam_fit: z.string().optional(),
      commercial_position: z.string().optional(),
      commercial_role: z.string().optional(),
      cannabis_status: z.string().optional(),
      cannabis_relevance_status: z.string().optional(),
      cannabis_evidence_strength: z.string().optional(),
      target_classes: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
      contacts: z.array(contactSchema).max(20).optional(),
      add_note: z.string().trim().min(1).max(5000).optional().describe("Appended, not a replacement"),
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
    "Update or correct one existing person. `contacts` REPLACES the entire contacts list (fetch " +
      "get_person first if you're adding to existing contacts rather than " +
      "replacing them) -- each one must be {type, value, label?}, type one " +
      "of phone/email/website/whatsapp/other. `add_note` appends a " +
      "timestamped free-text line to this person's notes (e.g. a meeting " +
      "summary) rather than replacing them.",
    {
      id: z.number().int(),
      name: z.string().trim().min(1).max(300).optional(),
      resolution_status: z.enum(["confirmed", "provisional", "resolved"]).optional(),
      linkedin_url: z.string().trim().url().max(500).optional(),
      contacts: z.array(contactSchema).max(20).optional(),
      add_note: z.string().trim().min(1).max(5000).optional().describe("Appended, not a replacement"),
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
  const server = buildServer(String(res.locals.accountId ?? "unknown"));
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
