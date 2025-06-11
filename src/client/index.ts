import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

async function getAccessToken(): Promise<string> {
    const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
    });

    const res = await axios.post(KEYCLOAK_TOKEN_URL, params.toString(), {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    return res.data.access_token;
}

async function main() {
    try {
        const token = await getAccessToken();
        const baseUrl = new URL(MCP_URL);
        const transport = new AuthStreamableHTTPClientTransport(baseUrl, token);

        const client = new Client({
            name: "streamable-http-client",
            version: "1.0.0",
        });

        await client.connect(transport);

        console.log("Server version:", client.getServerVersion());
        console.log("Tools:", await client.listTools());
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
