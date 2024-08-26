const fs = require("fs");
const { google } = require("googleapis");
const { UserDb } = require("../sql/classroom");
let gcClients = {};
const credsPath = "./creds.json";

async function getGoogleClient(name) {
  if (gcClients[name]) {
    return gcClients[name];
  }
  try {
    const gcClient = createClient();
    await authorize(gcClient, name);
    gcClients[name] = gcClient;
    return gcClient;
  } catch (e) {
    throw e;
  }
}
function createClient() {
  if (!fs.existsSync(credsPath)) {
    throw new Error("Creds not found");
  }
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf8"));
  const { client_id, client_secret, redirect_uris } = creds.web;
  const gcClient = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris
  );
  return gcClient;
}

async function authorize(gcClient, name) {
  const authToken = await getAuthToken(name);
  gcClient.setCredentials(authToken);
  const { token } = await gcClient.getAccessToken();
  await verifyAndUpdateToken(name, token);
}

async function getAuthToken(name) {
  const token = await UserDb.findOne({ where: { name } });
  return token;
}

async function verifyAndUpdateToken(name, token) {
  const json = await UserDb.findOne({ where: { name } });
  if (token !== json.access_token) {
    json.access_token = token;
    await json.save();
  }
}

async function createUser(name, tokens) {
  await UserDb.sync();
  const user = await UserDb.findOne({ where: { name: name } });
  if (user) {
    if (!tokens.refresh_token) {
      tokens.refresh_token = user.refresh_token;
    }
    user.update(tokens);
  } else {
    tokens.name = name;
    await UserDb.create(tokens);
  }
}

function setClient(name, client) {
  gcClients[name] = client;
}

module.exports = { getGoogleClient, createClient, createUser, setClient ,gcClients };
