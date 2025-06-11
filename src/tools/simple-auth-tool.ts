import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {z} from "zod";
import debug from 'debug';


export function addSimpleAuthTool(server: McpServer) {
    server.tool(
        "get_current_auth_token_info",
        "Gets info about the current auth token of the logged in user, when the user asks about its token/auth info this should be used to fetch it.",
        {
        },
        {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        },
        async (args, extra) => {
            const token = extra.authInfo?.token

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        token
                    })
                }]
            };
        }
    );
}