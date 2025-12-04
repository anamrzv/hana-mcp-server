/**
 * HTTP Server for MCP with HTTP Streamable protocol support
 * Provides HTTP streaming transport for MCP protocol
 */

const http = require('http');
const url = require('url');
const { logger } = require('../utils/logger');
const MCPHandler = require('./mcp-handler');
const { ERROR_CODES } = require('../constants/mcp-constants');

class HTTPServer {
  constructor(port = 3000) {
    this.port = port || parseInt(process.env.MCP_PORT) || 3000;
    this.server = null;
    this.clients = new Map();
    this.requestId = 0;
  }

  /**
   * Start HTTP server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        logger.error('HTTP Server error:', error.message);
        reject(error);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        logger.info(`HTTP Server listening on http://0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP request
   */
  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    logger.debug(`${req.method} ${pathname}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route handling
    switch (pathname) {
      case '/':
      case '/mcp':
        // Main MCP endpoint for both POST and GET
        if (req.method === 'POST') {
          this.handleMCPPost(req, res);
        } else if (req.method === 'GET') {
          this.handleMCPGet(req, res);
        } else {
          this.handleError(res, 405, 'Method Not Allowed');
        }
        break;
      case '/health':
        this.handleHealth(res);
        break;
      case '/mcp/rpc':
        if (req.method === 'POST') {
          this.handleRPC(req, res);
        } else {
          this.handleError(res, 405, 'Method Not Allowed');
        }
        break;
      case '/mcp/stream':
        if (req.method === 'GET') {
          this.handleStreamable(req, res);
        } else {
          this.handleError(res, 405, 'Method Not Allowed');
        }
        break;
      default:
        this.handleError(res, 404, 'Not Found');
    }
  }

  /**
   * Handle health check endpoint
   */
  handleHealth(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      port: this.port
    }));
  }

  /**
   * Handle MCP POST endpoint for JSON-RPC
   */
  async handleMCPPost(req, res) {
    return this.handleRPC(req, res);
  }

  /**
   * Handle MCP GET endpoint - establish SSE connection for MCP protocol
   */
  handleMCPGet(req, res) {
    const clientId = ++this.requestId;
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no'
    });

    // Send endpoint message
    const endpointMessage = {
      jsonrpc: '2.0',
      method: 'endpoint',
      params: {
        endpoint: `http://localhost:${this.port}/mcp`
      }
    };
    
    res.write(`data: ${JSON.stringify(endpointMessage)}\n\n`);

    // Store client connection
    this.clients.set(clientId, {
      res,
      connectedAt: new Date(),
      type: 'mcp'
    });

    logger.info(`MCP Client ${clientId} connected via SSE`);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      logger.info(`MCP Client ${clientId} disconnected`);
    });

    req.on('error', (error) => {
      logger.error(`MCP Client ${clientId} error:`, error.message);
      this.clients.delete(clientId);
    });

    // Keep connection alive
    const keepAliveInterval = setInterval(() => {
      if (!this.clients.has(clientId)) {
        clearInterval(keepAliveInterval);
        return;
      }
      try {
        res.write(': keepalive\n\n');
      } catch (error) {
        logger.error(`Failed to send keepalive to MCP client ${clientId}:`, error.message);
        this.clients.delete(clientId);
        clearInterval(keepAliveInterval);
      }
    }, 30000);
  }

  /**
   * Handle JSON-RPC POST requests
   */
  async handleRPC(req, res) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        logger.debug('RPC Request:', JSON.stringify(request));

        // Validate request
        const validation = MCPHandler.validateRequest(request);
        if (!validation.valid) {
          this.sendJSON(res, {
            jsonrpc: '2.0',
            id: request.id || null,
            error: {
              code: ERROR_CODES.INVALID_REQUEST,
              message: validation.error
            }
          });
          return;
        }

        // Handle request
        const response = await MCPHandler.handleRequest(request);
        logger.debug('RPC Response:', JSON.stringify(response));

        this.sendJSON(res, response);
      } catch (error) {
        logger.error('RPC Error:', error.message);
        this.sendJSON(res, {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: ERROR_CODES.PARSE_ERROR,
            message: 'Parse error',
            data: error.message
          }
        }, 400);
      }
    });
  }

  /**
   * Handle HTTP Streamable protocol
   * Uses NDJSON (Newline Delimited JSON) format for streaming
   */
  handleStreamable(req, res) {
    const clientId = ++this.requestId;
    
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked'
    });

    // Send initial connection message (NDJSON format)
    res.write(JSON.stringify({
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    }) + '\n');

    // Store client connection
    this.clients.set(clientId, {
      res,
      connectedAt: new Date()
    });

    logger.info(`Client ${clientId} connected via HTTP Streamable`);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      logger.info(`Client ${clientId} disconnected`);
    });

    req.on('error', (error) => {
      logger.error(`Client ${clientId} error:`, error.message);
      this.clients.delete(clientId);
    });

    // Keep connection alive with periodic keepalive messages
    const keepAliveInterval = setInterval(() => {
      if (!this.clients.has(clientId)) {
        clearInterval(keepAliveInterval);
        return;
      }
      try {
        res.write(JSON.stringify({
          type: 'keepalive',
          timestamp: new Date().toISOString()
        }) + '\n');
      } catch (error) {
        logger.error(`Failed to send keepalive to client ${clientId}:`, error.message);
        this.clients.delete(clientId);
        clearInterval(keepAliveInterval);
      }
    }, 30000);
  }

  /**
   * Broadcast message to all connected HTTP Streamable clients
   * Format: NDJSON (one JSON object per line)
   */
  broadcastStreamable(event, data) {
    const message = JSON.stringify({
      type: event,
      data,
      timestamp: new Date().toISOString()
    }) + '\n';
    
    for (const [clientId, client] of this.clients) {
      try {
        client.res.write(message);
      } catch (error) {
        logger.error(`Failed to send to client ${clientId}:`, error.message);
        this.clients.delete(clientId);
      }
    }
  }

  /**
   * Send JSON response
   */
  sendJSON(res, data, statusCode = 200) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  handleError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: message,
      statusCode
    }));
  }

  /**
   * Shutdown server
   */
  async shutdown() {
    return new Promise((resolve) => {
      // Close all client connections
      for (const [clientId, client] of this.clients) {
        try {
          client.res.end();
        } catch (error) {
          logger.error(`Error closing client ${clientId}:`, error.message);
        }
      }
      this.clients.clear();

      // Close server
      if (this.server) {
        this.server.close(() => {
          logger.info('HTTP Server shut down');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = HTTPServer;
