const { google } = require("googleapis");
const { UserDb } = require("../sql/classroom"); // Assuming this path is correct

let gcClients = {};
// const credsPath = "./creds.json"; // No longer needed for client credentials

// Optional: If you use a .env file for local development
// require('dotenv').config(); // Make sure to npm install dotenv

async function getGoogleClient(name) {
  if (gcClients[name]) {
    return gcClients[name];
  }
  try {
    const gcClient = createClient(); // createClient now uses environment variables
    await authorize(gcClient, name);
    gcClients[name] = gcClient;
    return gcClient;
  } catch (e) {
    // Consider more specific error handling or logging here
    console.error(`Error getting Google Client for ${name}:`, e.message);
    throw e; // Re-throw the error if you want the caller to handle it
  }
}

function createClient() {
  // Read credentials from environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    let missing = [];
    if (!clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!redirectUri) missing.push("GOOGLE_REDIRECT_URI");
    throw new Error(
      `Missing Google OAuth2 credentials in environment variables: ${missing.join(", ")}`
    );
  }

  // The redirect_uris from creds.web was an array.
  // The google.auth.OAuth2 constructor usually takes a single redirect URI.
  // If you need to handle multiple, you might need to adjust this or
  // select the appropriate one based on context.
  // For this example, we're assuming GOOGLE_REDIRECT_URI is the one to use.
  const gcClient = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri // Use the single redirect URI from env
  );
  return gcClient;
}

async function authorize(gcClient, name) {
  const authTokenData = await getAuthTokenFromDb(name); // Renamed for clarity
  if (!authTokenData) {
    throw new Error(
      `No auth token found in DB for user: ${name}. User needs to authorize first.`
    );
  }
  gcClient.setCredentials(authTokenData); // authTokenData should be { access_token, refresh_token, expiry_date, etc. }

  // Check if access token is expired or close to expiring, and refresh if needed.
  // The googleapis library often handles this automatically if a refresh token is present.
  // However, an explicit refresh can be done.
  // For simplicity, we'll rely on the library's auto-refresh or the getAccessToken call.

  try {
    // The getAccessToken() call will attempt to refresh the token if it's expired
    // and a refresh_token is available in the credentials set.
    const { token } = await gcClient.getAccessToken(); // This is the new access_token

    // It's good practice to update the stored token if it was refreshed.
    // The 'token' event on the OAuth2 client is a more robust way to catch refreshed tokens.
    // For this structure, we'll update after getAccessToken.
    if (token && token !== authTokenData.access_token) {
      // If getAccessToken() returned a new token, it means it was refreshed.
      // The gcClient.credentials object is automatically updated.
      await updateUserTokenInDb(name, gcClient.credentials);
    }
    // If no new token was returned, the existing one was still valid.
  } catch (error) {
    console.error(`Error during token refresh/validation for ${name}:`, error.message);
    if (error.message.includes('invalid_grant') || error.message.includes('token has been expired or revoked')) {
        // This often means the refresh token is invalid, user needs to re-authenticate
        console.error(`Refresh token for ${name} might be invalid. User ${name} needs to re-authorize.`);
        // Optionally, delete the invalid token from DB or mark it as invalid
        // await UserDb.destroy({ where: { name } }); // Example of removing invalid token
        throw new Error(`Token for ${name} is invalid or revoked. Please re-authorize.`);
    }
    throw error; // Re-throw other errors
  }
}

async function getAuthTokenFromDb(name) {
  // Ensure UserDb.findOne returns the token in the format expected by gcClient.setCredentials
  // e.g., { access_token, refresh_token, expiry_date, token_type, scope }
  const tokenRecord = await UserDb.findOne({ where: { name } });
  if (tokenRecord) {
    // Assuming your UserDb stores tokens in a compatible format.
    // If not, you might need to map the fields here.
    // Example: return { access_token: tokenRecord.accessToken, refresh_token: tokenRecord.refreshToken, ... }
    return tokenRecord.get({ plain: true }); // Return plain object
  }
  return null;
}

// Updated function to save the whole credentials object
async function updateUserTokenInDb(name, newCredentials) {
  // newCredentials will be { access_token, refresh_token (if exists), expiry_date, etc. }
  const user = await UserDb.findOne({ where: { name } });
  if (user) {
    // Only update fields that are present in newCredentials
    const updateData = {};
    if (newCredentials.access_token) updateData.access_token = newCredentials.access_token;
    if (newCredentials.refresh_token) updateData.refresh_token = newCredentials.refresh_token; // Important if a new one is issued
    if (newCredentials.expiry_date) updateData.expiry_date = newCredentials.expiry_date;
    if (newCredentials.scope) updateData.scope = newCredentials.scope;
    if (newCredentials.token_type) updateData.token_type = newCredentials.token_type;
    // Add other relevant fields if your DB schema has them

    if (Object.keys(updateData).length > 0) {
        await user.update(updateData);
        console.log(`Token updated in DB for user: ${name}`);
    }
  } else {
    console.warn(`User ${name} not found in DB during token update.`);
  }
}

// This function seems to be for the initial creation/update from an authorization flow
async function createUser(name, tokensFromAuthFlow) {
  // tokensFromAuthFlow should be the object received after user grants permission,
  // containing access_token, refresh_token (crucial for first auth), expiry_date, etc.
  await UserDb.sync(); // Ensure table exists
  const user = await UserDb.findOne({ where: { name: name } });
  if (user) {
    const updateData = { ...tokensFromAuthFlow };
    // Preserve existing refresh_token if the new flow didn't provide one
    // (subsequent auth flows might not return a refresh_token if one already exists)
    if (!updateData.refresh_token && user.refresh_token) {
      updateData.refresh_token = user.refresh_token;
    }
    await user.update(updateData);
    console.log(`User ${name} tokens updated.`);
  } else {
    const createData = { name, ...tokensFromAuthFlow };
    if (!createData.refresh_token) {
        console.warn(`Creating user ${name} without a refresh_token. Offline access will not be possible.`);
    }
    await UserDb.create(createData);
    console.log(`User ${name} created with new tokens.`);
  }
}

function setClient(name, client) {
  gcClients[name] = client;
}

module.exports = { getGoogleClient, createClient, createUser, setClient, gcClients };