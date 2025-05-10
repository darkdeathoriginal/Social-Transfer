const { google } = require("googleapis");
const { UserDb } = require("../sql/classroom");

const gcClients = new Map();

function createClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing Google OAuth2 client credentials in environment variables."
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function createUser(setupName, tokens) {
  await UserDb.sync();
  const existingTokenRecord = await UserDb.findOne({
    where: { name: setupName },
  });

  const tokenDataToStore = {
    name: setupName,
    access_token: tokens.access_token,
    refresh_token:
      tokens.refresh_token ||
      (existingTokenRecord ? existingTokenRecord.refresh_token : null),
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
  };

  if (!tokenDataToStore.refresh_token) {
    console.warn(
      `WARNING: Storing tokens for setup "${setupName}" without a refresh_token. Offline access might fail.`
    );
  }

  if (existingTokenRecord) {
    await existingTokenRecord.update(tokenDataToStore);
    console.log(`Tokens updated in DB for setup: ${setupName}`);
  } else {
    await UserDb.create(tokenDataToStore);
    console.log(`New tokens stored in DB for setup: ${setupName}`);
  }

  if (gcClients.has(setupName)) {
    gcClients.delete(setupName);
  }
}

async function getGoogleClient(setupName) {
  if (gcClients.has(setupName)) {
    const cachedClient = gcClients.get(setupName);

    return cachedClient;
  }

  const tokenRecord = await UserDb.findOne({ where: { name: setupName } });
  if (!tokenRecord) {
    console.error(`No token record found in UserDb for setup: ${setupName}`);
    return null;
  }

  const client = createClient();
  client.setCredentials({
    access_token: tokenRecord.access_token,
    refresh_token: tokenRecord.refresh_token,
    scope: tokenRecord.scope,
    token_type: tokenRecord.token_type,
    expiry_date: tokenRecord.expiry_date,
  });

  client.on("tokens", async (newTokens) => {
    console.log(`Tokens refreshed for setup: ${setupName}`);
    let tokensToSave = { ...newTokens };

    if (!newTokens.refresh_token && tokenRecord.refresh_token) {
      tokensToSave.refresh_token = tokenRecord.refresh_token;
    }

    await createUser(setupName, tokensToSave);

    client.setCredentials(tokensToSave);
  });

  gcClients.set(setupName, client);
  return client;
}

function setClient(setupName, authorizedClient) {
  gcClients.set(setupName, authorizedClient);
}

module.exports = {
  getGoogleClient,
  createClient,
  createUser,
  setClient,
  gcClients,
};
