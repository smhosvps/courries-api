// services/appleAuth.service.ts
import appleSignin from 'apple-signin-auth';
import jwt from 'jsonwebtoken'; // Add this import

class AppleAuthService {
  private teamId: string;
  private clientId: string; // Service ID for web
  private appClientId: string; // App ID for native
  private keyId: string;
  private privateKey: string;

  constructor() {
    this.teamId = process.env.APPLE_TEAM_ID || '5WSM5B479U';
    this.clientId = process.env.APPLE_CLIENT_ID || 'com.smhosdeveloper.courriesRider.service';
    this.appClientId = 'com.smhosdeveloper.courriesRider'; // Your App ID
    this.keyId = process.env.APPLE_KEY_ID || '59A37C3TG6';
    this.privateKey = process.env.APPLE_PRIVATE_KEY || 'MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg87hwVOu8Ml5KGxMT1VPjLBWAbz7lAdqEdJtqEcfjP86gCgYIKoZIzj0DAQehRANCAARMEtei3tA/x18/nbjySi2Dgqq0WNjR6ucAZbagDmYVT0vSbJh1cdABhZgGs/ZvCfjBQgD0pCPDw56mnjoumytC';
  }

  /**
   * Verify the identity token from Apple
   */
 // services/appleAuth.service.ts
async verifyIdentityToken(identityToken: string): Promise<any> {
  try {
    // First, decode the token to check its audience without verification
    const decodedToken: any = jwt.decode(identityToken);
    
    // Define all possible audiences
    const possibleAudiences = [
      this.appClientId,           // Your App ID: com.smhosdeveloper.courriesRider
      'host.exp.Exponent',        // Expo Go (development)
      decodedToken?.aud           // The actual audience from token
    ].filter(Boolean);

    // Remove duplicates
    const validAudiences = [...new Set(possibleAudiences)];

    // Try to verify with each possible audience
    for (const audience of validAudiences) {
      try {
        const jwtClaims = await appleSignin.verifyIdToken(identityToken, {
          audience: audience,
          ignoreExpiration: false,
        });
        
        // Only log success
        console.log(`✅ Apple token verified with audience: ${audience}`);
        return jwtClaims;
      } catch (err) {
        // Silently fail for expected mismatches in development
        if (process.env.NODE_ENV === 'production') {
          console.log(`Verification failed for audience ${audience}:`, err.message);
        }
        // Continue to next audience
        continue;
      }
    }

    throw new Error('Token could not be verified with any valid audience');
    
  } catch (error) {
    console.error('❌ Apple ID token verification failed:', error);
    throw new Error('Invalid Apple identity token');
  }
}

  /**
   * Generate client secret for Apple API calls
   */
  getClientSecret(): string {
    return appleSignin.getClientSecret({
      clientID: this.clientId, // Use Service ID for client secret
      teamID: this.teamId,
      privateKey: this.privateKey,
      keyIdentifier: this.keyId,
      expAfter: 15777000, // 6 months in seconds
    });
  }

  /**
   * Generate client secret for App ID (if needed)
   */
  getAppClientSecret(): string {
    return appleSignin.getClientSecret({
      clientID: this.appClientId, // Use App ID for native app calls
      teamID: this.teamId,
      privateKey: this.privateKey,
      keyIdentifier: this.keyId,
      expAfter: 15777000,
    });
  }
}

export default new AppleAuthService();