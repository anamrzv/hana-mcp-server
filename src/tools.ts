import { z } from 'zod';
import { HanaClient } from './hana-client.js';

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  structuredContent?: any;
}

export class HanaTools {
  private hanaClient: HanaClient;

  constructor(hanaClient: HanaClient) {
    this.hanaClient = hanaClient;
  }

  async listSchemas(): Promise<ToolResult> {
    const query = `
      SELECT SCHEMA_NAME 
      FROM SYS.SCHEMAS 
      WHERE SCHEMA_NAME NOT IN ('SYS', 'SYSTEM', '_SYS_')
      ORDER BY SCHEMA_NAME
    `;
    const result = await this.hanaClient.query(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  async listTables(schemaName: string): Promise<ToolResult> {
    const query = `
      SELECT TABLE_NAME, TABLE_TYPE
      FROM SYS.TABLES
      WHERE SCHEMA_NAME = '${schemaName}'
      ORDER BY TABLE_NAME
    `;
    const result = await this.hanaClient.query(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  async listColumns(schemaName: string, tableName: string): Promise<ToolResult> {
    const query = `
      SELECT COLUMN_NAME, DATA_TYPE_NAME, POSITION
      FROM SYS.TABLE_COLUMNS
      WHERE SCHEMA_NAME = '${schemaName}' AND TABLE_NAME = '${tableName}'
      ORDER BY POSITION
    `;
    const result = await this.hanaClient.query(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  async executeQuery(query: string): Promise<ToolResult> {
    // Validate query is SELECT only
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      throw new Error('Only SELECT queries are allowed');
    }

    const result = await this.hanaClient.query(query);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  }

  async testConnection(): Promise<ToolResult> {
    const query = 'SELECT 1 as test_value FROM DUMMY';
    const result = await this.hanaClient.query(query);
    return {
      content: [
        {
          type: 'text',
          text: `Connection successful. Test value: ${result[0]?.TEST_VALUE || 'unknown'}`,
        },
      ],
      structuredContent: { connected: true, testValue: result[0]?.TEST_VALUE },
    };
  }
}
