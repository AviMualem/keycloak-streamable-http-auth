
import { OAuthMetadataSchema } from '@modelcontextprotocol/sdk/shared/auth.js';
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";

import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";


const realm = "demo";
const clientId = "my-client";
const clientSecret = "dPjoLjfT43EdMDHvz1osSiOCLHeOKURz";
const keycloakBaseUrl = `http://localhost:9090/realms/${realm}`;


async function fetchOAuthMetadata() {
    const url = `${keycloakBaseUrl}/.well-known/openid-configuration`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch OAuth metadata: ${res.statusText}`);
    const data = await res.json();
    return OAuthMetadataSchema.parse(data);
}

 async function createAuthMetadataRouter() {
    const oauthMetadata = await fetchOAuthMetadata();

    return mcpAuthMetadataRouter({
        oauthMetadata,
        resourceServerUrl: new URL("http://localhost:3000"),
        resourceName: "example-server",
    });
}

 const tokenVerifier = {
    verifyAccessToken: async (token: string) => {
        const metadata = await fetchOAuthMetadata();
        if (!metadata.introspection_endpoint) {
            throw new Error("No introspection endpoint found in OAuth metadata");
        }

        const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const res = await fetch(metadata.introspection_endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": `Basic ${basicAuth}`,
            },
            body: new URLSearchParams({ token }).toString(),
        });

        if (!res.ok) {
            console.error(`Token introspection failed: ${res.status} ${await res.text()}`);
            console.log("🔒 Throwing authentication error");
            const error = new Error("invalid_token");
            error.name = "AuthenticationError";
            throw error;
        }
        
        const data = await res.json();

        if (!data.active) {
            console.log("Token is inactive or expired - throwing authentication error");
            const error = new Error("invalid_token");
            error.name = "AuthenticationError";
            throw error;
        }

        console.log("Token verified successfully:", { clientId: data.client_id, scopes: data.scope });
        return {
            token,
            clientId: data.client_id,
            scopes: data.scope ? data.scope.split(" ") : [],
            expiresAt: data.exp,
        };
    }
};

export async function createAuthMiddleware() {
    // Custom authentication middleware with proper 401 handling
    return async (req: any, res: any, next: any) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            console.log("🔒 No authorization header - returning 401");
            return res.status(401).json({
                error: "invalid_token",
                error_description: "Missing authorization header"
            });
        }

        if (!authHeader.startsWith('Bearer ')) {
            console.log("🔒 Invalid authorization format - returning 401");
            return res.status(401).json({
                error: "invalid_token", 
                error_description: "Invalid authorization header format"
            });
        }

        const token = authHeader.substring(7);
        
        try {
            const authInfo = await tokenVerifier.verifyAccessToken(token);
            console.log("✅ Token verified successfully");
            req.auth = authInfo;
            next();
        } catch (error) {
            console.log("🔒 Token verification failed - returning 401");
            return res.status(401).json({
                error: "invalid_token",
                error_description: "The access token is invalid, expired, or has been revoked"
            });
        }
    };
}

export {fetchOAuthMetadata, createAuthMetadataRouter}