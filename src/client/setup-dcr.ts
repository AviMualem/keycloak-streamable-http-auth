import axios from 'axios';

// Keycloak configuration
const KEYCLOAK_BASE_URL = 'http://localhost:8080';
const REALM = 'demo';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin'; // Change this to your admin password

interface ClientRegistrationResponse {
    client_id: string;
    client_secret?: string;
    registration_access_token: string;
    registration_client_uri: string;
    client_name: string;
    redirect_uris: string[];
}

class KeycloakDCRSetup {
    private adminToken: string = '';

    // Step 1: Get admin access token
    async getAdminToken(): Promise<string> {
        console.log('🔑 Getting admin access token...');
        
        const params = new URLSearchParams({
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD,
            grant_type: 'password',
            client_id: 'admin-cli'
        });

        try {
            const response = await axios.post(
                `${KEYCLOAK_BASE_URL}/realms/master/protocol/openid-connect/token`,
                params.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.adminToken = response.data.access_token;
            console.log('✅ Admin token obtained successfully');
            return this.adminToken;
        } catch (error) {
            console.error('❌ Failed to get admin token:', error);
            throw error;
        }
    }

    // Step 2: Configure realm to allow client registration
    async enableClientRegistration(): Promise<void> {
        console.log('⚙️ Enabling client registration...');

        try {
            // Get current realm configuration
            const realmResponse = await axios.get(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const realmConfig = realmResponse.data;
            
            // Enable registration
            realmConfig.registrationAllowed = true;
            
            // Update realm
            await axios.put(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}`,
                realmConfig,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Client registration enabled');
        } catch (error) {
            console.error('⚠️ Could not modify realm settings:', error);
            // Continue anyway - registration might already be enabled
        }
    }

    // Step 3: Set up client registration policies to allow localhost
    async setupTrustedHosts(): Promise<void> {
        console.log('🔒 Setting up trusted hosts policy...');

        try {
            // Try to get existing client policies
            const policiesResponse = await axios.get(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/client-policies/policies`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`
                    }
                }
            );

            console.log('📋 Current client policies found');

            // Create a policy to allow localhost (this is complex and version-dependent)
            // For now, we'll try to modify via component providers
            
        } catch (error) {
            console.log('⚠️ Could not configure trusted hosts policy automatically');
            console.log('💡 You may need to configure this manually in Keycloak admin console');
        }
    }

    // Step 4: Create initial access token for secure registration
    async createInitialAccessToken(): Promise<string | null> {
        console.log('🎫 Creating initial access token...');

        try {
            const tokenData = {
                expiration: 3600, // 1 hour
                count: 10 // Allow 10 registrations
            };

            const response = await axios.post(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/clients-initial-access`,
                tokenData,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Initial access token created');
            return response.data.token;
        } catch (error) {
            console.error('⚠️ Could not create initial access token:', error);
            return null;
        }
    }

    // Step 5: Test anonymous client registration
    async testAnonymousRegistration(): Promise<ClientRegistrationResponse | null> {
        console.log('🧪 Testing anonymous client registration...');

        const clientData = {
            client_name: 'Test Dynamic Client',
            redirect_uris: ['http://localhost:3001/callback', 'http://localhost:3002/callback'],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            scope: 'openid profile email'
        };

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

            console.log('✅ Anonymous registration successful!');
            return response.data;
        } catch (error) {
            console.log('❌ Anonymous registration failed');
            if (axios.isAxiosError(error) && error.response) {
                console.log('Error:', error.response.data);
            }
            return null;
        }
    }

    // Step 6: Test registration with initial access token
    async testTokenBasedRegistration(initialToken: string): Promise<ClientRegistrationResponse | null> {
        console.log('🧪 Testing token-based client registration...');

        const clientData = {
            client_name: 'Secure Dynamic Client',
            redirect_uris: ['http://localhost:3001/callback'],
            grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
            response_types: ['code'],
            scope: 'openid profile email',
            token_endpoint_auth_method: 'client_secret_basic'
        };

        try {
            const response = await axios.post(
                `${KEYCLOAK_BASE_URL}/realms/${REALM}/clients-registrations/openid-connect`,
                clientData,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${initialToken}`
                    }
                }
            );

            console.log('✅ Token-based registration successful!');
            return response.data;
        } catch (error) {
            console.log('❌ Token-based registration failed');
            if (axios.isAxiosError(error) && error.response) {
                console.log('Error:', error.response.data);
            }
            return null;
        }
    }

    // Step 7: Disable host checking temporarily via component configuration
    async disableHostChecking(): Promise<void> {
        console.log('🔓 Attempting to disable host checking...');

        try {
            // Get realm components
            const componentsResponse = await axios.get(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/components`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`
                    }
                }
            );

            // Look for client registration policy components
            const components = componentsResponse.data;
            const policyComponent = components.find((c: any) => 
                c.providerType === 'org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy'
            );

            if (policyComponent) {
                console.log('📋 Found client registration policy component');
                // This would require more complex manipulation
            }

            // Alternative: Try to create a permissive policy
            const permissivePolicy = {
                parentId: REALM,
                providerId: 'trusted-hosts',
                providerType: 'org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy',
                name: 'Permissive Hosts Policy',
                config: {
                    'trusted-hosts': ['localhost', '127.0.0.1', '::1'],
                    'host-sending-registration-request-must-match': ['false']
                }
            };

            await axios.post(
                `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/components`,
                permissivePolicy,
                {
                    headers: {
                        'Authorization': `Bearer ${this.adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('✅ Created permissive host policy');

        } catch (error) {
            console.log('⚠️ Could not automatically configure host policy');
        }
    }

    // Main setup method
    async setupDCR(): Promise<void> {
        try {
            console.log('🚀 Setting up Dynamic Client Registration...\n');

            // Step 1: Get admin token
            await this.getAdminToken();

            // Step 2: Enable client registration
            await this.enableClientRegistration();

            // Step 3: Try to setup trusted hosts
            await this.setupTrustedHosts();

            // Step 4: Try to disable host checking
            await this.disableHostChecking();

            // Step 5: Create initial access token
            const initialToken = await this.createInitialAccessToken();

            // Step 6: Test anonymous registration
            console.log('\n--- Testing Registration ---');
            const anonymousResult = await this.testAnonymousRegistration();

            // Step 7: Test token-based registration if we have a token
            let tokenResult = null;
            if (initialToken) {
                tokenResult = await this.testTokenBasedRegistration(initialToken);
            }

            // Summary
            console.log('\n=== SUMMARY ===');
            if (anonymousResult) {
                console.log('✅ Anonymous registration: SUCCESS');
                console.log('📋 Client ID:', anonymousResult.client_id);
                if (anonymousResult.client_secret) {
                    console.log('🔑 Client Secret:', anonymousResult.client_secret);
                }
            } else {
                console.log('❌ Anonymous registration: FAILED');
            }

            if (tokenResult) {
                console.log('✅ Token-based registration: SUCCESS');
                console.log('📋 Secure Client ID:', tokenResult.client_id);
                if (tokenResult.client_secret) {
                    console.log('🔑 Secure Client Secret:', tokenResult.client_secret);
                }
            } else if (initialToken) {
                console.log('❌ Token-based registration: FAILED');
            }

            if (initialToken) {
                console.log('🎫 Initial Access Token:', initialToken);
                console.log('💡 Use this token for secure client registrations');
            }

            console.log('\n📚 Next steps:');
            console.log('1. Use the client credentials above in your applications');
            console.log('2. For production, use token-based registration');
            console.log('3. Set up proper host policies in Keycloak admin console');

        } catch (error) {
            console.error('❌ Setup failed:', error);
        }
    }
}

// Run the setup
async function main() {
    const setup = new KeycloakDCRSetup();
    await setup.setupDCR();
}

main().catch(console.error); 