import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import {createAuthMetadataRouter, createAuthMiddleware, fetchOAuthMetadata} from "./auth/auth-util.js";
import {addSimpleAuthTool} from "../tools/simple-auth-tool.js";

const app = express();

// Request logging middleware - logs every incoming request
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const sessionId = req.headers['mcp-session-id'] || 'None';
    
    console.log(`\n[${timestamp}] ${req.method} ${req.originalUrl}`);
    console.log(`  Session ID: ${sessionId}`);
    console.log(`  Headers:`, JSON.stringify(req.headers, null, 2));
    
    if (req.body && Object.keys(req.body).length > 0) {
        console.log(`  Body:`, JSON.stringify(req.body, null, 2));
        console.log(`  Is Initialize Request:`, isInitializeRequest(req.body));
    }
    
    // Log response when it finishes
    const originalSend = res.send;
    res.send = function(body) {
        console.log(`[${timestamp}] Response ${res.statusCode} for ${req.method} ${req.originalUrl}`);
        if (res.statusCode >= 400) {
            console.log(`  Error Response:`, body);
        }
        return originalSend.call(this, body);
    };
    
    next();
});

app.use(express.json());

// Initialize auth components with error handling
let authMiddleware: any;
let authMetadataRouter: any;

try {
    console.log("Initializing OAuth middleware...");
    authMiddleware = await createAuthMiddleware();
    authMetadataRouter = await createAuthMetadataRouter();
    console.log("✅ OAuth middleware initialized successfully");
} catch (error) {
    console.error("❌ Failed to initialize OAuth middleware:", error);
    console.log("⚠️  Server will run without OAuth authentication");
    
    // Fallback: no-op middleware
    authMiddleware = (req: any, res: any, next: any) => next();
    authMetadataRouter = express.Router();
}

// Create a single MCP server instance
const server = new McpServer({
    name: "example-server",
    version: "1.0.0",
});


addSimpleAuthTool(server);

// TODO: Add your server tools, prompts, capabilities here, e.g.
// server.addTool(...);

// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

app.use(authMetadataRouter);

app.post('/mcp',authMiddleware, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
        // New initialization request — create a new transport
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
                transports[newSessionId] = transport;
            },
        });

        // Clean up transport when closed
        transport.onclose = () => {
            if (transport.sessionId) {
                delete transports[transport.sessionId];
            }
        };

        // Connect this transport to the single MCP server instance
        await server.connect(transport);
    } else {
        // Invalid request: missing or unknown session ID
        res.status(400).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Bad Request: No valid session ID provided',
            },
            id: null,
        });
        return;
    }

    // Handle the MCP request using the transport
    await transport.handleRequest(req, res, req.body);
});

// Helper to handle GET and DELETE requests to /mcp
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }

    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
};

app.get('/mcp', authMiddleware, handleSessionRequest);
app.delete('/mcp', authMiddleware, handleSessionRequest);

// Custom error handler for authentication errors (must be after routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.error("Error caught by middleware:", err);
    
    // Check if this is an authentication error
    if (err.code === 'invalid_token' || 
        err.status === 401 || 
        err.message?.includes('Token is inactive') ||
        err.message?.includes('invalid_token')) {
        
        console.log("🔒 Returning 401 Unauthorized for token error");
        res.status(401).json({ 
            error: 'invalid_token',
            error_description: 'The access token is invalid, expired, or has been revoked'
        });
        return;
    }
    
    // For all other errors, return generic 500
    console.error("💥 Unexpected server error:", err);
    res.status(500).json({ 
        error: 'server_error',
        error_description: 'Internal Server Error' 
    });
});

app.listen(3000, () => {
    console.log("MCP server listening on http://localhost:3000");
});