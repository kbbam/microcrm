import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { z } from "zod";
import * as crm from "./crm.js";

function buildServer(): McpServer {
  const server = new McpServer({ name: "microcrm", version: "0.1.0" });

  server.tool(
    "search_entities",
    "Search organizations/pharmacy locations by name, type, lead tier, or cannabis status.",
    {
      query: z.string().optional().describe("Case-insensitive substring match on name"),
      type: z.enum(["organization", "pharmacy_location", "person"]).optional(),
      lead_tier: z.enum(["high", "medium", "watch", "unscored"]).optional(),
      cannabis_status: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ query, type, lead_tier, cannabis_status, limit }) => {
      const results = await crm.searchEntities({
        query,
        type,
        leadTier: lead_tier,
        cannabisStatus: cannabis_status,
        limit,
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
    "Update fields on one entity. Only lead_tier, bam_fit, commercial_position, " +
      "commercial_role, contacts, cannabis_status, target_classes, " +
      "cannabis_relevance_status, and cannabis_evidence_strength may be changed.",
    { id: z.number().int(), patch: z.record(z.any()) },
    async ({ id, patch }) => {
      const result = await crm.updateEntity(id, patch);
      if (!result) {
        return { content: [{ type: "text", text: `No entity with id ${id}.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "search_people",
    "Search people by name.",
    {
      query: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ query, limit }) => {
      const results = await crm.searchPeople({ query, limit });
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
    "Update fields on one person. Only roles, contacts, and event_presence may be changed.",
    { id: z.number().int(), patch: z.record(z.any()) },
    async ({ id, patch }) => {
      const result = await crm.updatePerson(id, patch);
      if (!result) {
        return { content: [{ type: "text", text: `No person with id ${id}.` }], isError: true };
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
