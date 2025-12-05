#!/usr/bin/env node
import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getHanaConfig, getServerConfig } from './config.js';
import { HanaClient } from './hana-client.js';
import { HanaTools } from './tools.js';

const hanaConfig = getHanaConfig();
const hanaClient = new HanaClient(hanaConfig);
const tools = new HanaTools(hanaClient);

const server = new McpServer(
  {
    name: 'hana-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: { tools: { } },
  }
);

// Register tools
server.registerTool(
  'test-connection',
  {
    title: 'Test Connection',
    description: 'Test connection to HANA database',
    inputSchema: {}
  },
  async (): Promise<CallToolResult> => {
    const result = await tools.testConnection();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            result: result.structuredContent,
          }),
        },
      ],
    };
  }
);

server.registerTool(
  'list-schemas',
  {
    title: 'List Schemas',
    description: 'List all available schemas in HANA database',
    inputSchema: {}
  },
  async (): Promise<CallToolResult> => {
    const result = await tools.listSchemas();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            result: result.structuredContent,
          }),
        },
      ],
    };
  }
);

server.registerTool(
  'list-tables',
  {
    title: 'List Tables',
    description: 'List all tables in a specific schema',
    inputSchema: {
      schema_name: z.string().describe('The schema name')
    }
  },
  async ({ schema_name }): Promise<CallToolResult> => {
    const result = await tools.listTables(schema_name);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            result: result.structuredContent,
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "list-columns",
  {
    title: "List Columns",
    description: "List all columns in a specific table",
    inputSchema: {
      schema_name: z.string().describe("The schema name"),
      table_name: z.string().describe("The table name")
    }
  },
  async ({ schema_name, table_name }) => {
    const result = await tools.listColumns(schema_name, table_name);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            result: result.structuredContent,
          }),
        },
      ],
    };
  }
);


server.registerTool(
  'execute-query',
  {
    title: 'Execute Query',
    description: 'Execute a SELECT query against HANA database',
    inputSchema: {
      query: z.string().describe('The SELECT query to execute')
    }
  },
  async ({ query }): Promise<CallToolResult> => {
    const result = await tools.executeQuery(query);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'success',
            result: result.structuredContent,
          }),
        },
      ],
    };
  }
);


async function main() {
  try {
    // Connect to HANA
    console.error('Connecting to HANA database...');
    await hanaClient.connect();
    console.error('Connected to HANA successfully');

    // Get server config
    const serverConfig = getServerConfig();

    // Create Express app
    const app = express();
    app.use(express.json());

    // CORS middleware
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // MCP endpoint
    app.post('/mcp', async (req: Request, res: Response) => {
      const allowedHostsString = process.env.MCP_ALLOWED_HOSTS;
      const allowedOriginsString = process.env.MCP_ALLOWED_ORIGINS;

      const parsedAllowedHosts = allowedHostsString
        ? allowedHostsString.split(',').map((h) => h.trim())
        : ['127.0.0.1'];
      const parsedAllowedOrigins = allowedOriginsString
        ? allowedOriginsString.split(',').map((o) => o.trim())
        : [];

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
        allowedHosts: parsedAllowedHosts,
        allowedOrigins: parsedAllowedOrigins,
      });

      res.on('close', () => {
        transport.close();
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    const port = parseInt(process.env.HTTP_PORT || '3000');
    app.listen(port, '0.0.0.0', () => {
      console.error(`MCP Server running on http://0.0.0.0:${port}/mcp`);
    }).on('error', (error: Error) => {
      console.error('Server error:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

main();
