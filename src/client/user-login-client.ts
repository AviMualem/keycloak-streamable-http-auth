import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as readline from 'readline';

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
            const url = typeof input === 'string' ? input : 
                       input instanceof URL ? input.toString() : 
                       'url' in input ? input.url : '';
            
            if (url.startsWith(targetUrl)) {
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

// Keycloak token endpoint and client credentials
const KEYCLOAK_TOKEN_URL = "http://localhost:8080/realms/demo/protocol/openid-connect/token";
const CLIENT_ID = "my-client";
const CLIENT_SECRET = "dPjoLjfT43EdMDHvz1osSiOCLHeOKURz";
const MCP_URL = "http://localhost:3000/mcp";

// Function to prompt user for input
function promptUser(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Get access token using username/password flow
async function getAccessTokenWithUserLogin(username: string, password: string): Promise<string> {
    console.log('🔐 Authenticating with Keycloak...');
    
    const params = new URLSearchParams({
        grant_type: "password",           // Changed from client_credentials
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        username: username,              // User's username
        password: password,              // User's password
        scope: "openid profile email"
    });

    try {
        const res = await axios.post(KEYCLOAK_TOKEN_URL, params.toString(), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });

        console.log('✅ Authentication successful!');
        return res.data.access_token;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error('❌ Authentication failed:', error.response.data);
            throw new Error(`Login failed: ${error.response.data.error_description || error.response.data.error}`);
        }
        throw error;
    }
}

async function main() {
    try {
        console.log('🚀 MCP Client with User Authentication');
        console.log('=====================================\n');

        // Prompt for username and password
        const username = await promptUser('Username: ');
        const password = await promptUser('Password: ');
        console.log(''); // New line after password input

        // Get access token using user credentials
        const token = await getAccessTokenWithUserLogin(username, password);
        
        console.log('🔗 Connecting to MCP server...');
        const baseUrl = new URL(MCP_URL);
        const transport = new AuthStreamableHTTPClientTransport(baseUrl, token);

        const client = new Client({
            name: "user-authenticated-client",
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