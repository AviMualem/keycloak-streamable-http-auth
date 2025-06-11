import axios from 'axios';

// Configuration
const KEYCLOAK_BASE_URL = 'http://localhost:8080';
const REALM = 'demo';

interface DynamicClientRequest {
    client_name: string;
    redirect_uris: string[];
    grant_types?: string[];
    response_types?: string[];
    scope?: string;
    token_endpoint_auth_method?: string;
    client_uri?: string;
    logo_uri?: string;
    contacts?: string[];
}

interface DynamicClientResponse {
    client_id: string;
    client_secret?: string;
    registration_access_token: string;
    registration_client_uri: string;
    client_name: string;
    redirect_uris: string[];
    grant_types: string[];
    response_types: string[];
    client_id_issued_at: number;
    client_secret_expires_at?: number;
}

class DynamicClientRegistration {
    
    // Register client anonymously (if allowed)
    async registerAnonymous(clientData: DynamicClientRequest): Promise<DynamicClientResponse> {
        console.log('🔄 Registering client anonymously...');
        
        try {
            const response = await axios.post(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect`,
                clientData,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Client registered successfully!');
            return response.data;
        } catch (error) {
            console.error('❌ Registration failed:', error);
            if (axios.isAxiosError(error) && error.response) {
                throw new Error(`Registration failed: ${error.response.data.error_description || error.response.data.error}`);
            }
            throw error;
        }
    }

    // Register client with initial access token (secure)
    async registerWithToken(clientData: DynamicClientRequest, initialAccessToken: string): Promise<DynamicClientResponse> {
        console.log('🔐 Registering client with initial access token...');
        
        try {
            const response = await axios.post(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect`,
                clientData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${initialAccessToken}`
                    }
                }
            );

            console.log('✅ Client registered successfully!');
            return response.data;
        } catch (error) {
            console.error('❌ Registration failed:', error);
            if (axios.isAxiosError(error) && error.response) {
                throw new Error(`Registration failed: ${error.response.data.error_description || error.response.data.error}`);
            }
            throw error;
        }
    }

    // Read client configuration
    async readClient(clientId: string, registrationAccessToken: string): Promise<DynamicClientResponse> {
        console.log(`📖 Reading client configuration for ${clientId}...`);
        
        try {
            const response = await axios.get(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect/${clientId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${registrationAccessToken}`
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('❌ Failed to read client:', error);
            throw error;
        }
    }

    // Update client configuration
    async updateClient(clientId: string, clientData: DynamicClientRequest, registrationAccessToken: string): Promise<DynamicClientResponse> {
        console.log(`🔄 Updating client ${clientId}...`);
        
        try {
            const response = await axios.put(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect/${clientId}`,
                clientData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${registrationAccessToken}`
                    }
                }
            );

            console.log('✅ Client updated successfully!');
            return response.data;
        } catch (error) {
            console.error('❌ Update failed:', error);
            throw error;
        }
    }

    // Delete client
    async deleteClient(clientId: string, registrationAccessToken: string): Promise<void> {
        console.log(`🗑️ Deleting client ${clientId}...`);
        
        try {
            await axios.delete(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect/${clientId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${registrationAccessToken}`
                    }
                }
            );

            console.log('✅ Client deleted successfully!');
        } catch (error) {
            console.error('❌ Delete failed:', error);
            throw error;
        }
    }
}

// Example usage
async function demonstrateDCR() {
    const dcr = new DynamicClientRegistration();

    // Example client configuration
    const clientConfig: DynamicClientRequest = {
        client_name: 'My Dynamic MCP Client',
        redirect_uris: [
            'http://localhost:3001/callback',
            'http://localhost:3002/callback'
        ],
        grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
        response_types: ['code'],
        scope: 'openid profile email',
        token_endpoint_auth_method: 'client_secret_basic',
        client_uri: 'http://localhost:3000',
        contacts: ['admin@example.com']
    };

    try {
        console.log('🚀 Dynamic Client Registration Demo\n');

        // Try anonymous registration first
        let clientInfo: DynamicClientResponse;
        
        try {
            clientInfo = await dcr.registerAnonymous(clientConfig);
            console.log('\n📋 Client registered anonymously:');
        } catch (error) {
            console.log('\n❌ Anonymous registration failed, you may need an initial access token');
            
            // Prompt for initial access token
            console.log('\n💡 If you have an initial access token, you can try:');
            console.log('const token = "your-initial-access-token";');
            console.log('const clientInfo = await dcr.registerWithToken(clientConfig, token);');
            return;
        }

        // Display client info
        console.log('Client ID:', clientInfo.client_id);
        if (clientInfo.client_secret) {
            console.log('Client Secret:', clientInfo.client_secret);
        }
        console.log('Registration Access Token:', clientInfo.registration_access_token);
        console.log('Redirect URIs:', clientInfo.redirect_uris);

        // Demo reading the client
        console.log('\n📖 Reading client configuration...');
        const readResult = await dcr.readClient(clientInfo.client_id, clientInfo.registration_access_token);
        console.log('✅ Client read successfully');

        // Demo updating the client
        console.log('\n🔄 Updating client configuration...');
        const updatedConfig = {
            ...clientConfig,
            client_name: 'Updated MCP Client',
            redirect_uris: [...clientConfig.redirect_uris, 'http://localhost:3003/callback']
        };
        
        const updateResult = await dcr.updateClient(
            clientInfo.client_id,
            updatedConfig,
            clientInfo.registration_access_token
        );
        console.log('✅ Client updated successfully');
        console.log('New redirect URIs:', updateResult.redirect_uris);

        // Ask if user wants to delete the test client
        console.log('\n🗑️ Test client created. You can delete it or keep it for testing.');
        console.log('To delete: await dcr.deleteClient(clientId, registrationAccessToken);');
        
        console.log('\n=== SUCCESS! ===');
        console.log('Dynamic Client Registration is working!');
        console.log('You can now register clients programmatically.');

    } catch (error) {
        console.error('\n❌ Demo failed:', error);
    }
}

// Export for use in other scripts
export { DynamicClientRegistration, type DynamicClientRequest, type DynamicClientResponse };

// Run demo if this file is executed directly
if (require.main === module) {
    demonstrateDCR();
} 