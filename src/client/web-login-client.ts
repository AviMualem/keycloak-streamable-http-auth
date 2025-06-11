import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as http from 'http';
import { URL } from 'url';
import { randomBytes } from 'crypto';
import open from 'open';

class AuthStreamableHTTPClientTransport extends StreamableHTTPClientTransport {
    private token: string;
    private originalFetch: typeof fetch;

    constructor(baseUrl: URL, token: string) {
        super(baseUrl);
        this.token = token;
        this.originalFetch = globalThis.fetch;
        
        // Override fetch with proper header handling
        const authToken = this.token;
        const targetUrl = baseUrl.toString();
        
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const requestUrl = typeof input === 'string' ? input : 
                              input instanceof URL ? input.toString() : 
                              'url' in input ? input.url : '';
            
            if (requestUrl.startsWith(targetUrl)) {
                // Merge headers properly, preserving existing ones
                const existingHeaders = init?.headers || {};
                const headersObj = existingHeaders instanceof Headers ? 
                    Object.fromEntries(existingHeaders.entries()) : 
                    existingHeaders;
                
                const newInit = {
                    ...init,
                    headers: {
                        ...headersObj,
                        'Authorization': `Bearer ${authToken}`
                    }
                };
                
                return this.originalFetch(input, newInit);
            }
            
            return this.originalFetch(input, init);
        };
    }
}

// Keycloak and client configuration
const KEYCLOAK_BASE_URL = "http://localhost:8080/realms/demo";
const CLIENT_ID = "my-client";
const CLIENT_SECRET = "dPjoLjfT43EdMDHvz1osSiOCLHeOKURz";
const REDIRECT_URI = "http://localhost:3001/callback";
const MCP_URL = "http://localhost:3000/mcp";

// Generate a random state parameter for security
function generateState(): string {
    return randomBytes(16).toString('hex');
}

// Open browser (or provide instructions)
async function openBrowser(url: string): Promise<void> {
    console.log('\n🌐 Opening browser for login...');
    console.log('If the browser doesn\'t open automatically, please visit:');
    console.log(url);
    console.log('\n⏳ Waiting for authentication...\n');
    
    // Try to open browser automatically using the 'open' package
    try {
        await open(url);
        console.log('✅ Browser opened successfully!');
    } catch (error) {
        console.log('⚠️ Could not open browser automatically. Please visit the URL above manually.');
    }
}

// Set up callback server and wait for authorization code
function waitForAuthorizationCode(state: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url || '', `http://localhost:3001`);
            
            if (url.pathname === '/callback') {
                const code = url.searchParams.get('code');
                const returnedState = url.searchParams.get('state');
                const error = url.searchParams.get('error');
                
                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body>
                            <h1>❌ Authentication Failed</h1>
                            <p>Error: ${error}</p>
                            <p>You can close this window.</p>
                        </body>
                        </html>
                    `);
                    server.close();
                    reject(new Error(`Authentication failed: ${error}`));
                    return;
                }
                
                if (!code) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body>
                            <h1>❌ No Authorization Code</h1>
                            <p>No authorization code received.</p>
                            <p>You can close this window.</p>
                        </body>
                        </html>
                    `);
                    server.close();
                    reject(new Error('No authorization code received'));
                    return;
                }
                
                if (returnedState !== state) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`
                        <html>
                        <body>
                            <h1>❌ Security Error</h1>
                            <p>State parameter mismatch. This might be a security issue.</p>
                            <p>You can close this window.</p>
                        </body>
                        </html>
                    `);
                    server.close();
                    reject(new Error('State parameter mismatch'));
                    return;
                }
                
                // Success!
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                    <body>
                        <h1>✅ Authentication Successful!</h1>
                        <p>You have successfully logged in. You can close this window.</p>
                        <script>window.close();</script>
                    </body>
                    </html>
                `);
                
                server.close();
                resolve(code);
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not found');
            }
        });
        
        server.listen(3001, () => {
            console.log('📡 Callback server started on http://localhost:3001');
        });
        
        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error('Authentication timeout - no response received within 5 minutes'));
        }, 5 * 60 * 1000);
    });
}

// Exchange authorization code for access token
async function exchangeCodeForToken(code: string): Promise<string> {
    console.log('🔄 Exchanging authorization code for access token...');
    
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI,
    });

    try {
        const res = await axios.post(`${KEYCLOAK_BASE_URL}/protocol/openid-connect/token`, params.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        console.log('✅ Token exchange successful!');
        return res.data.access_token;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error('❌ Token exchange failed:', error.response.data);
            throw new Error(`Token exchange failed: ${error.response.data.error_description || error.response.data.error}`);
        }
        throw error;
    }
}

// Main authentication flow
async function authenticateWithBrowser(): Promise<string> {
    console.log('🚀 Starting browser-based authentication...');
    
    // Generate state parameter for security
    const state = generateState();
    
    // Build authorization URL
    const authUrl = new URL(`${KEYCLOAK_BASE_URL}/protocol/openid-connect/auth`);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('state', state);
    
    // Open browser and wait for callback
    await openBrowser(authUrl.toString());
    const code = await waitForAuthorizationCode(state);
    
    // Exchange code for token
    return await exchangeCodeForToken(code);
}

async function main() {
    try {
        console.log('🌐 MCP Client with Browser Authentication');
        console.log('=========================================\n');

        // Authenticate via browser
        const token = await authenticateWithBrowser();
        
        console.log('🔗 Connecting to MCP server...');
        const baseUrl = new URL(MCP_URL);
        const transport = new AuthStreamableHTTPClientTransport(baseUrl, token);

        const client = new Client({
            name: "browser-authenticated-client",
            version: "1.0.0",
        });

        await client.connect(transport);

        console.log("✅ Connected successfully!");
        console.log("📋 Server version:", client.getServerVersion());
        console.log("🛠️  Available tools:", await client.listTools());

        // You can add more client operations here
        // const result = await client.callTool("get_sdl_info", {});
        // console.log("Tool result:", result);

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

main(); 