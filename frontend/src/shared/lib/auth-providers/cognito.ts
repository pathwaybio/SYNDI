// SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
// SPDX-FileContributor: Kimberly Robasky
// SPDX-License-Identifier: Apache-2.0

/**
 * AWS Cognito Authentication Provider
 * 
 * Provides authentication using AWS Cognito for production and staging environments.
 * Uses AWS SDK v3 (not Amplify) to work with CloudFront + S3 deployments.
 * Requires AWS Cognito User Pool and Identity Pool configuration.
 */

import { AuthProvider, User } from '../auth';

// AWS Cognito SDK imports (install with: npm install @aws-sdk/client-cognito-identity-provider)
// Conditional import to avoid build errors if not installed
let CognitoIdentityProviderClient: any;
let AuthFlowType: any;
let InitiateAuthCommand: any;
let RespondToAuthChallengeCommand: any;
let SignUpCommand: any;
let ConfirmSignUpCommand: any;
let ForgotPasswordCommand: any;
let ConfirmForgotPasswordCommand: any;

// Try to import AWS SDK, fall back to graceful degradation if not available
const loadAwsSdk = async () => {
  try {
    const awsSdk = await import('@aws-sdk/client-cognito-identity-provider');
    CognitoIdentityProviderClient = awsSdk.CognitoIdentityProviderClient;
    AuthFlowType = awsSdk.AuthFlowType;
    InitiateAuthCommand = awsSdk.InitiateAuthCommand;
    RespondToAuthChallengeCommand = awsSdk.RespondToAuthChallengeCommand;
    SignUpCommand = awsSdk.SignUpCommand;
    ConfirmSignUpCommand = awsSdk.ConfirmSignUpCommand;
    ForgotPasswordCommand = awsSdk.ForgotPasswordCommand;
    ConfirmForgotPasswordCommand = awsSdk.ConfirmForgotPasswordCommand;
  } catch (error) {
    console.warn('AWS SDK not available, Cognito provider will not function');
  }
};

// Load SDK when module is imported
loadAwsSdk();

export interface CognitoAuthConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  identityPoolId?: string;
}

export class CognitoAuthProvider implements AuthProvider {
  private config: CognitoAuthConfig;
  private currentUser: User | null = null;
  private cognitoClient: any = null;
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;

  constructor(config: CognitoAuthConfig) {
    this.config = config;
    this.initializeAsync();
  }

  private async initializeAsync(): Promise<void> {
    await loadAwsSdk();
    await this.initializeCognito();
    this.loadCurrentUser();
  }

  private async initializeCognito(): Promise<void> {
    try {
      if (!CognitoIdentityProviderClient) {
        throw new Error('AWS SDK not available. Install @aws-sdk/client-cognito-identity-provider');
      }

      // Initialize AWS Cognito client
      this.cognitoClient = new CognitoIdentityProviderClient({
        region: this.config.region,
        // Credentials will be handled by the runtime environment
        // In browser: use Cognito Identity Pool or temporary credentials
        // In Lambda: use IAM role
        // For local development: use AWS credentials file or environment variables
      });

      console.log('✅ Cognito client initialized for region:', this.config.region);
    } catch (error) {
      console.error('❌ Failed to initialize Cognito:', error);
      throw new Error(`Cognito initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async login(email: string, password: string): Promise<User> {
    try {
      if (!this.cognitoClient) {
        throw new Error('Cognito client not initialized');
      }

      // Initiate auth with AWS Cognito
      const authCommand = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: this.config.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const authResponse = await this.cognitoClient.send(authCommand);

      if (authResponse.ChallengeName) {
        // Handle MFA or other challenges if needed
        throw new Error(`Authentication challenge required: ${authResponse.ChallengeName}`);
      }

      if (!authResponse.AuthenticationResult) {
        throw new Error('Authentication failed: no result returned');
      }

      const { AccessToken, RefreshToken, IdToken } = authResponse.AuthenticationResult;

      // Parse user information from ID token
      const userInfo = this.parseIdToken(IdToken);
      
      const user: User = {
        id: userInfo.sub,
        email: userInfo.email,
        username: userInfo['cognito:username'] || userInfo.email.split('@')[0],
        name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
        groups: userInfo['cognito:groups'] || ['user'],
        permissions: this.mapCognitoPermissions(userInfo['cognito:groups'] || ['user']),
        isAdmin: (userInfo['cognito:groups'] || []).includes('admin'),
        token: IdToken,  // Use ID token for API Gateway Cognito authorizer
        refreshToken: RefreshToken,
      };

      this.currentUser = user;
      this.accessToken = AccessToken;
      this.refreshTokenValue = RefreshToken;
      this.saveCurrentUser(user);

      console.log('✅ Cognito login successful:', user.username);
      return user;
    } catch (error) {
      console.error('❌ Cognito login failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async logout(): Promise<void> {
    try {
      // Note: AWS Cognito doesn't have a logout API that invalidates tokens
      // Tokens will expire naturally based on their TTL
      // For immediate logout, you could maintain a token blacklist on your backend
      
      this.currentUser = null;
      this.accessToken = null;
      this.refreshTokenValue = null;
      localStorage.removeItem('cognito-auth-user');
      
      console.log('✅ Cognito logout successful');
    } catch (error) {
      console.error('❌ Cognito logout failed:', error);
      // Still clear local state even if logout fails
      this.currentUser = null;
      this.accessToken = null;
      this.refreshTokenValue = null;
      localStorage.removeItem('cognito-auth-user');
    }
  }

  async signup(email: string, password: string, name: string): Promise<User> {
    try {
      if (!this.cognitoClient) {
        throw new Error('Cognito client not initialized');
      }

      const [firstName, lastName] = name.split(' ');
      
      const signUpCommand = new SignUpCommand({
        ClientId: this.config.clientId,
        Username: email,
        Password: password,
        UserAttributes: [
          {
            Name: 'email',
            Value: email,
          },
          {
            Name: 'given_name',
            Value: firstName || name,
          },
          {
            Name: 'family_name',
            Value: lastName || '',
          },
        ],
      });

      const signUpResponse = await this.cognitoClient.send(signUpCommand);

      // For signup, return a temporary user object
      // Real authentication will happen after email confirmation
      const user: User = {
        id: signUpResponse.UserSub,
        email: email,
        username: email.split('@')[0],
        name: name,
        groups: ['user'],
        permissions: ['view:own'],
        isAdmin: false,
        token: '', // No token until confirmed and logged in
      };

      console.log('✅ Cognito signup successful, confirmation required');
      return user;
    } catch (error) {
      console.error('❌ Cognito signup failed:', error);
      throw new Error(`Signup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshToken(): Promise<User> {
    try {
      if (!this.cognitoClient || !this.refreshTokenValue) {
        throw new Error('No refresh token available');
      }

      const refreshCommand = new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: this.config.clientId,
        AuthParameters: {
          REFRESH_TOKEN: this.refreshTokenValue,
        },
      });

      const refreshResponse = await this.cognitoClient.send(refreshCommand);

      if (!refreshResponse.AuthenticationResult) {
        throw new Error('Token refresh failed: no result returned');
      }

      const { AccessToken, IdToken } = refreshResponse.AuthenticationResult;
      
      // Parse updated user information
      const userInfo = this.parseIdToken(IdToken);
      
      const user: User = {
        id: userInfo.sub,
        email: userInfo.email,
        username: userInfo['cognito:username'] || userInfo.email.split('@')[0],
        name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
        groups: userInfo['cognito:groups'] || ['user'],
        permissions: this.mapCognitoPermissions(userInfo['cognito:groups'] || ['user']),
        isAdmin: (userInfo['cognito:groups'] || []).includes('admin'),
        token: IdToken,  // Use ID token for API Gateway Cognito authorizer
        refreshToken: this.refreshTokenValue || undefined, // Keep existing refresh token
      };

      this.currentUser = user;
      this.accessToken = AccessToken;
      this.saveCurrentUser(user);

      console.log('✅ Cognito token refreshed');
      return user;
    } catch (error) {
      console.error('❌ Cognito token refresh failed:', error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<User> {
    try {
      // For AWS Cognito, we can decode the JWT to get user info
      // In production, you might want to verify the signature against Cognito's JWKs
      const userInfo = this.parseIdToken(token);
      
      // Check if token has expired
      const now = Math.floor(Date.now() / 1000);
      if (userInfo.exp <= now) {
        throw new Error('Token has expired');
      }

      return {
        id: userInfo.sub,
        email: userInfo.email,
        username: userInfo['cognito:username'] || userInfo.email.split('@')[0],
        name: userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
        groups: userInfo['cognito:groups'] || ['user'],
        permissions: this.mapCognitoPermissions(userInfo['cognito:groups'] || ['user']),
        isAdmin: (userInfo['cognito:groups'] || []).includes('admin'),
        token: token,
      };
    } catch (error) {
      console.error('❌ Cognito token validation failed:', error);
      throw error;
    }
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.currentUser && this.accessToken) {
      try {
        // Validate that the current token is still valid
        await this.validateToken(this.accessToken);
        return this.currentUser;
      } catch (error) {
        console.warn('Current Cognito token is invalid:', error);
        
        // Try to refresh the token
        try {
          return await this.refreshToken();
        } catch (refreshError) {
          console.warn('Token refresh failed:', refreshError);
          this.currentUser = null;
          this.accessToken = null;
          this.refreshTokenValue = null;
          localStorage.removeItem('cognito-auth-user');
          return null;
        }
      }
    }
    
    return this.currentUser;
  }

  // Cognito-specific helpers
  async confirmSignup(email: string, confirmationCode: string): Promise<void> {
    try {
      if (!this.cognitoClient) {
        throw new Error('Cognito client not initialized');
      }

      const confirmCommand = new ConfirmSignUpCommand({
        ClientId: this.config.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
      });

      await this.cognitoClient.send(confirmCommand);
      console.log('✅ Cognito signup confirmed');
    } catch (error) {
      console.error('❌ Cognito signup confirmation failed:', error);
      throw error;
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      if (!this.cognitoClient) {
        throw new Error('Cognito client not initialized');
      }

      const forgotPasswordCommand = new ForgotPasswordCommand({
        ClientId: this.config.clientId,
        Username: email,
      });

      await this.cognitoClient.send(forgotPasswordCommand);
      console.log('✅ Password reset code sent');
    } catch (error) {
      console.error('❌ Forgot password failed:', error);
      throw error;
    }
  }

  async confirmForgotPassword(email: string, confirmationCode: string, newPassword: string): Promise<void> {
    try {
      if (!this.cognitoClient) {
        throw new Error('Cognito client not initialized');
      }

      const confirmForgotPasswordCommand = new ConfirmForgotPasswordCommand({
        ClientId: this.config.clientId,
        Username: email,
        ConfirmationCode: confirmationCode,
        Password: newPassword,
      });

      await this.cognitoClient.send(confirmForgotPasswordCommand);
      console.log('✅ Password reset confirmed');
    } catch (error) {
      console.error('❌ Password reset confirmation failed:', error);
      throw error;
    }
  }

  private parseIdToken(idToken: string): any {
    try {
      // Simple JWT decode (header.payload.signature)
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      // Decode the payload (base64url -> JSON)
      const payload = parts[1];
      const decoded = JSON.parse(this.base64UrlDecode(payload));

      return decoded;
    } catch (error) {
      console.error('Failed to parse ID token:', error);
      throw new Error(`Invalid ID token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private base64UrlDecode(base64Url: string): string {
    // Convert base64url to base64
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '=';
    }
    
    // Decode base64 to string
    return atob(base64);
  }

  private mapCognitoPermissions(groups: string[]): string[] {
    const permissionMapping: Record<string, string[]> = {
      'admin': ['*'],
      'researcher': ['submit:SOP*', 'view:own', 'view:group'],
      'user': ['view:own'],
      'service': ['submit:*', 'view:*']
    };
    
    const permissions: string[] = [];
    for (const group of groups) {
      permissions.push(...(permissionMapping[group] || ['view:own']));
    }
    
    return [...new Set(permissions)]; // Remove duplicates
  }

  private loadCurrentUser(): void {
    try {
      const stored = localStorage.getItem('cognito-auth-user');
      if (stored) {
        const data = JSON.parse(stored);
        this.currentUser = data.user;
        this.accessToken = data.accessToken;
        this.refreshTokenValue = data.refreshToken;
      }
    } catch (error) {
      console.warn('Failed to load stored Cognito user:', error);
      localStorage.removeItem('cognito-auth-user');
    }
  }

  private saveCurrentUser(user: User): void {
    try {
      const data = {
        user: user,
        accessToken: this.accessToken,
        refreshToken: this.refreshTokenValue,
        timestamp: Date.now()
      };
      localStorage.setItem('cognito-auth-user', JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to save Cognito user:', error);
    }
  }
} 