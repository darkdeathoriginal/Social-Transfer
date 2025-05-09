const { Module, onMessage } = require('../WA_index'); // Assuming this is your Baileys wrapper
const { google } = require('googleapis');
const fs = require('fs'); // Keep for now, might be needed for other things or can be removed later
const { DriveDb, addDrive, deleteDrive } = require("./sql/drive");
const { getCode, closeServer } = require("./utils/server"); // Your OAuth code capture utility
const { addShort } = require('./utils/urlshortner');
const { SERVER } = require('../config'); // Your server URL for shortener
const { getGoogleClient, createClient, createUser, setClient } = require('./utils/googleClient');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

// User-specific contexts
const userDriveSetupContexts = new Map(); // Key: jid, Value: { state, jid, tempOAuthClient, fileIdToSave, ... }
const userMoveFileContexts = new Map();  // Key: jid, Value: { state, jid, sourceFolderId, destFolderId, targetUserEmail, tempClient, ... }

// --- State Definitions for Drive Setup ---
const DRIVE_SETUP_STATES = {
    AWAITING_AUTH_CONFIRMATION: 'awaiting_auth_confirmation', // After auth URL is sent
    FOLDER_CHOICE: 'folder_choice',
    SELECT_EXISTING_FOLDER: 'select_existing_folder',
    AWAITING_NEW_FOLDER_NAME: 'awaiting_new_folder_name', // If creating a new one
};

// --- State Definitions for Move File ---
const MOVE_FILE_STATES = {
    SELECT_SOURCE_FOLDER: 'select_source_folder',
    SELECT_DESTINATION_OPTION: 'select_destination_option', // 1. Existing, 2. New in root, 3. New in parent
    SELECT_DESTINATION_FOLDER_EXISTING: 'select_destination_folder_existing',
    AWAITING_NEW_FOLDER_NAME_DEST: 'awaiting_new_folder_name_dest',
    SELECT_PARENT_FOLDER_FOR_NEW_DEST: 'select_parent_folder_for_new_dest',
    AWAITING_USER_EMAIL: 'awaiting_user_email',
    AWAITING_MOVE_CONFIRMATION: 'awaiting_move_confirmation',
};


Module({ pattern: 'drive', fromMe: false, desc: 'Google Drive setup and management', use: 'utility' }, async (m, match) => {
    const userJid = m.jid;

    if (match && match[1] && match[1].toLowerCase() === "del") {
        try {
            const existingSetup = await DriveDb.findOne({ where: { jid: userJid } }); // Assuming jid is the primary key or a unique field
            if (existingSetup) {
                await deleteDrive(userJid); // Your function to delete from DB
                // If you were storing user-specific token files (discouraged), you'd delete them here.
                // e.g., if (fs.existsSync(`./session/${userJid}_gdrive_token.json`)) {
                //          await fs.promises.unlink(`./session/${userJid}_gdrive_token.json`);
                //       }
                return await m.send("Google Drive setup deleted successfully.");
            } else {
                return await m.send("No Google Drive setup found for your account.");
            }
        } catch (error) {
            console.error(`Error deleting drive setup for ${userJid}:`, error);
            return await m.send("An error occurred while trying to delete your Drive setup.");
        }
    } else {
        // Start new setup or inform if already set up
        await DriveDb.sync(); // Ensure DB is synced before any operations
        const existingSetup = await DriveDb.findOne({ where: { jid: userJid } });
        if (existingSetup && !userDriveSetupContexts.has(userJid)) { // Not currently in a setup flow
            return await m.send("You have already set up Google Drive. Use 'drive del' to remove the existing setup first.");
        }
        if (userDriveSetupContexts.has(userJid)) {
            return await m.send("You are already in a setup process. Type 'stop' to cancel it first.");
        }

        try {
        const tempOAuthClient = createClient(); // From googleClient.js (uses env vars for client_id/secret)
        const authUrl = tempOAuthClient.generateAuthUrl({
            access_type: 'offline',
            prompt: "consent", // Ensure refresh token
            scope: SCOPES,
            state: userJid // Optional: Pass jid as state to verify in your redirect URI handler
        });

            const shortId = await addShort(authUrl);
            const fullShortUrl = `${SERVER}/short/${shortId}`; // Ensure SERVER is your correct base URL

            userDriveSetupContexts.set(userJid, {
                state: DRIVE_SETUP_STATES.AWAITING_AUTH_CONFIRMATION,
                jid: userJid,
                tempOAuthClient: tempOAuthClient,
            });

            await m.send(`Please authorize this application by visiting this URL: ${fullShortUrl}\nYour local server should open to capture the authorization code. Once authorized, the setup will continue automatically if possible, or I will ask for the code.`);
            
            // getCode() is blocking and should resolve when the local server gets the code
            const authCode = await getCode(); // This needs to be robust
            // closeServer(); // Close the temp server after getting the code

            // --- Code received, now process it ---
            const currentContext = userDriveSetupContexts.get(userJid);
            if (!currentContext || currentContext.state !== DRIVE_SETUP_STATES.AWAITING_AUTH_CONFIRMATION) {
                // This might happen if the user typed 'stop' or another command intervened.
                // Or if getCode resolved unexpectedly.
                console.warn(`Auth code received for ${userJid}, but no active auth context found or state mismatch.`);
                if(currentContext) userDriveSetupContexts.delete(userJid);
                return await m.send("Authorization process was interrupted or timed out. Please try 'drive' again.");
            }

            const { tokens } = await currentContext.tempOAuthClient.getToken(authCode);
            currentContext.tempOAuthClient.setCredentials(tokens); // Client is now authorized

            // Save tokens to DB using your googleClient's createUser or a similar function
            await createUser(userJid, tokens); // createUser should handle DB storage.
            // setClient(userJid, currentContext.tempOAuthClient); // Cache the authorized client in googleClient

            currentContext.state = DRIVE_SETUP_STATES.FOLDER_CHOICE;
            await m.send("Account authorized successfully! \nDo you want to select an existing folder or create a new one for bot uploads? Reply with 'existing' or 'new'.");

        } catch (error) {
            console.error(`Error during Drive setup for ${userJid}:`, error);
            await m.send("An error occurred during authorization. Please try the 'drive' command again.");
            userDriveSetupContexts.delete(userJid);
            // if (fs.existsSync(credsPath)) await fs.promises.unlink(credsPath); // Clean up if creds.json was ever used
            // closeServer(); // Ensure server is closed on error too
        }
    }
});

Module({ pattern: 'movefile', fromMe: false, desc: 'Move files between folders', use: 'utility' }, async (m, match) => {
    const userJid = m.jid;
    const userDrive = await DriveDb.findOne({ where: { jid: userJid } }); // Check if user has a Drive setup
    if (!userDrive) {
        return await m.send("Please set up your Google Drive first using the 'drive' command.");
    }
    if (userMoveFileContexts.has(userJid)) {
        return await m.send("You are already in a file move process. Type 'stop' to cancel it first.");
    }

    try {
        const authorizedGcClient = await getGoogleClient(userJid);
        if (!authorizedGcClient) throw new Error("Failed to get authorized Google client.");

        userMoveFileContexts.set(userJid, {
            state: MOVE_FILE_STATES.SELECT_SOURCE_FOLDER,
            jid: userJid,
            client: authorizedGcClient, // Store authorized client for this flow
            // other fields like sourceFolderId, destFolderId will be added
        });
        await listAndSendFolders(m, authorizedGcClient, "Please select the source folder by replying with its number:");
    } catch (error) {
        console.error(`Error starting movefile for ${userJid}:`, error);
        await m.send("Could not initiate file move. Ensure your Drive is properly set up and authorized.");
        userMoveFileContexts.delete(userJid);
    }
});

onMessage({ /* pattern: 'message', // Assuming your onMessage handles all non-command messages */ fromMe: false }, async (m, match) => {
    const userJid = m.jid;
    const driveSetupCtx = userDriveSetupContexts.get(userJid);
    const moveFileCtx = userMoveFileContexts.get(userJid);

    if (driveSetupCtx) {
        if (m.message.toLowerCase() === 'stop') {
            userDriveSetupContexts.delete(userJid);
            // if (fs.existsSync(credsPath)) await fs.promises.unlink(credsPath); // Cleanup if used
            // closeServer(); // If a server was running for this user's setup
            return await m.send("Drive setup process stopped.");
        }
        try {
            await handleDriveSetupState(m, driveSetupCtx);
        } catch (error) {
            console.error(`Error in drive setup state for ${userJid}:`, error);
            await m.send("An error occurred during setup. Process stopped. Please try 'drive' again.");
            userDriveSetupContexts.delete(userJid);
            // if (fs.existsSync(credsPath)) await fs.promises.unlink(credsPath);
            // closeServer();
        }
        return; // Processed by drive setup
    }

    if (moveFileCtx) {
        if (m.message.toLowerCase() === 'stop') {
            userMoveFileContexts.delete(userJid);
            return await m.send("Move file process stopped.");
        }
        try {
            await handleMoveFileState(m, moveFileCtx);
        } catch (error) {
            console.error(`Error in move file state for ${userJid}:`, error);
            await m.send("An error occurred during file move. Process stopped.");
            userMoveFileContexts.delete(userJid);
        }
        return; // Processed by move file
    }
});

// --- Drive Setup State Handler ---
async function handleDriveSetupState(m, context) {
    // No 'creds' or 'name' state anymore as OAuth is handled differently
    switch (context.state) {
        case DRIVE_SETUP_STATES.FOLDER_CHOICE:
            await handleFolderChoice(m, context);
            break;
        case DRIVE_SETUP_STATES.SELECT_EXISTING_FOLDER:
            await handleSelectExistingFolder(m, context);
            break;
        // Add other states if you re-introduce them e.g. AWAITING_NEW_FOLDER_NAME
        default:
            console.warn(`Unhandled drive setup state: ${context.state} for ${context.jid}`);
            await m.send("I'm a bit confused. Let's restart that part. Type 'stop' and then 'drive' again.");
    }
}

async function handleFolderChoice(m, context) {
    const choice = m.message.toLowerCase().trim();
    const authorizedGcClient = await getGoogleClient(context.jid); // Get the authorized client
    if (!authorizedGcClient) throw new Error("Authorization lost or client not found for folder choice.");
    context.client = authorizedGcClient; // Ensure context has the up-to-date client

    if (choice === 'existing') {
        context.state = DRIVE_SETUP_STATES.SELECT_EXISTING_FOLDER;
        await listAndSendFolders(m, context.client, "Select an existing folder by replying with its number:");
    } else if (choice === 'new') {
        try {
            const newFolderId = await createDriveFolder(context.client, 'Drive_Bot_Uploads'); // Default name
            await m.send(`New folder "Drive_Bot_Uploads" created with ID: ${newFolderId}`);
            context.fileIdToSave = newFolderId;
            await finishDriveSetup(m, context);
        } catch (error) {
            console.error(`Error creating new folder for ${context.jid}:`, error);
            await m.send("Failed to create a new folder. Please ensure permissions are correct. Try again or select 'existing'.");
            // Optionally revert state or offer retry
            context.state = DRIVE_SETUP_STATES.FOLDER_CHOICE; // Back to choice
            await m.send("Do you want to select an existing folder or create a new one? (existing/new)");
        }
    } else {
        await m.send("Invalid choice. Please reply with 'existing' or 'new'.");
    }
}

async function handleSelectExistingFolder(m, context) {
    const choice = parseInt(m.message.trim());
    // Fetch folders again or retrieve from context if stored temporarily
    const folders = await fetchDriveFolders(context.client);

    if (folders && choice > 0 && choice <= folders.length) {
        context.fileIdToSave = folders[choice - 1].id;
        await m.send(`Selected folder: ${folders[choice - 1].name}`);
        await finishDriveSetup(m, context);
    } else {
        await m.send("Invalid selection. Please try again, or type 'new' to create a new folder.");
        // Optionally, re-list folders or go back to FOLDER_CHOICE
        await listAndSendFolders(m, context.client, "Invalid choice. Select an existing folder by number, or type 'stop' and then 'drive' to try creating a new folder.");
        // Keep state as SELECT_EXISTING_FOLDER for retry
    }
}

async function createDriveFolder(gcClient, folderName, parentFolderId = null) {
    const drive = google.drive({ version: 'v3', auth: gcClient });
    const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
    }
    const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return file.data.id;
}

async function finishDriveSetup(m, context) {
    const dataToSave = {
        jid: context.jid,
        FileId: context.fileIdToSave, // This should be the selected/created folder ID
        // name: context.jid, // Or some other identifier if needed
    };
    await addDrive(context.jid, dataToSave); // Your DB function
    await m.send("Google Drive setup completed successfully!");
    userDriveSetupContexts.delete(context.jid);
}


// --- Move File State Handler ---
async function handleMoveFileState(m, context) { // context is userMoveFileContexts.get(m.jid)
    // Ensure client is still authorized (it should be, as it was fetched at the start of 'movefile')
    if (!context.client) {
        await m.send("Authorization issue. Please try 'movefile' again.");
        userMoveFileContexts.delete(context.jid);
        return;
    }

    switch (context.state) {
        case MOVE_FILE_STATES.SELECT_SOURCE_FOLDER:
            await handleSourceFolderSelection(m, context);
            break;
        case MOVE_FILE_STATES.SELECT_DESTINATION_OPTION:
            await handleDestinationOptionSelection(m, context);
            break;
        case MOVE_FILE_STATES.SELECT_DESTINATION_FOLDER_EXISTING:
            await handleSelectDestFolderExisting(m, context);
            break;
        case MOVE_FILE_STATES.AWAITING_NEW_FOLDER_NAME_DEST:
            await handleCreateNewDestFolder(m, context);
            break;
        case MOVE_FILE_STATES.SELECT_PARENT_FOLDER_FOR_NEW_DEST:
            await handleSelectParentForNewDest(m, context);
            break;
        case MOVE_FILE_STATES.AWAITING_USER_EMAIL:
            await handleUserEmailInput(m, context);
            break;
        case MOVE_FILE_STATES.AWAITING_MOVE_CONFIRMATION:
            await handleMoveConfirmation(m, context);
            break;
        default:
            console.warn(`Unhandled move file state: ${context.state} for ${context.jid}`);
            await m.send("I'm a bit confused with the file move. Let's stop. Type 'movefile' to try again.");
            userMoveFileContexts.delete(context.jid);
    }
}

async function fetchDriveFolders(gcClient) {
    const drive = google.drive({ version: 'v3', auth: gcClient });
    try {
        const res = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive',
            orderBy: 'name'
        });
        return res.data.files || [];
    } catch (error) {
        console.error("Error fetching drive folders:", error);
        throw new Error("Could not fetch folder list from Google Drive.");
    }
}

async function listAndSendFolders(m, gcClient, messagePrefix) {
    try {
        const folders = await fetchDriveFolders(gcClient);
        if (!folders || folders.length === 0) {
            return await m.send(messagePrefix + "\nNo folders found in your Google Drive.");
        }
        let folderListMsg = messagePrefix + "\n";
        folders.forEach((folder, index) => {
            folderListMsg += `${index + 1}. ${folder.name}\n`;
        });
        await m.send(folderListMsg);
    } catch (error) {
        await m.send(error.message || "Could not list folders. Please check permissions or try again.");
    }
}

// --- Placeholder implementations for moveFile state handlers ---
async function handleSourceFolderSelection(m, context) {
    const choice = parseInt(m.message.trim());
    const folders = await fetchDriveFolders(context.client); // Fetch again or use from context if stored

    if (folders && choice > 0 && choice <= folders.length) {
        context.sourceFolderId = folders[choice - 1].id;
        context.sourceFolderName = folders[choice - 1].name; // Store name for messages
        context.state = MOVE_FILE_STATES.SELECT_DESTINATION_OPTION;
        await m.send(`Source folder "${context.sourceFolderName}" selected.\nNow choose the destination:\n1. Select an existing folder\n2. Create a new folder in root\n3. Create a new folder inside another folder`);
    } else {
        await m.send("Invalid selection. Please reply with a valid number.");
        await listAndSendFolders(m, context.client, "Please select the source folder by replying with its number:"); // Re-ask
    }
}

async function handleDestinationOptionSelection(m, context) {
    const choice = parseInt(m.message.trim());
    switch (choice) {
        case 1:
            context.state = MOVE_FILE_STATES.SELECT_DESTINATION_FOLDER_EXISTING;
            await listAndSendFolders(m, context.client, "Select the destination folder by replying with its number:");
            break;
        case 2: // Create new in root
            context.state = MOVE_FILE_STATES.AWAITING_NEW_FOLDER_NAME_DEST;
            context.newDestParentFolderId = null; // null means root
            await m.send("Enter the name for the new destination folder:");
            break;
        case 3: // Create new in parent
            context.state = MOVE_FILE_STATES.SELECT_PARENT_FOLDER_FOR_NEW_DEST;
            await listAndSendFolders(m, context.client, "Select the PARENT folder for your new destination folder:");
            break;
        default:
            await m.send("Invalid choice. Please reply with 1, 2, or 3.");
    }
}

async function handleSelectDestFolderExisting(m, context) {
    const choice = parseInt(m.message.trim());
    const folders = await fetchDriveFolders(context.client);
    if (folders && choice > 0 && choice <= folders.length) {
        context.destFolderId = folders[choice - 1].id;
        context.destFolderName = folders[choice - 1].name;
        context.state = MOVE_FILE_STATES.AWAITING_USER_EMAIL;
        await m.send(`Destination folder "${context.destFolderName}" selected.\nNow, enter the email address of the user whose files you want to move (e.g., user@example.com). Type 'me' for your own files.`);
    } else {
        await m.send("Invalid selection.");
        await listAndSendFolders(m, context.client, "Select the destination folder by number:");
    }
}

async function handleSelectParentForNewDest(m, context) {
    const choice = parseInt(m.message.trim());
    const folders = await fetchDriveFolders(context.client);
    if (folders && choice > 0 && choice <= folders.length) {
        context.newDestParentFolderId = folders[choice - 1].id;
        context.state = MOVE_FILE_STATES.AWAITING_NEW_FOLDER_NAME_DEST;
        await m.send(`Parent folder "${folders[choice - 1].name}" selected for the new destination.\nEnter the name for the new destination folder:`);
    } else {
        await m.send("Invalid selection.");
        await listAndSendFolders(m, context.client, "Select the PARENT folder by number:");
    }
}

async function handleCreateNewDestFolder(m, context) {
    const newFolderName = m.message.trim();
    if (!newFolderName) {
        return await m.send("Folder name cannot be empty. Please enter a name:");
    }
    try {
        const newFolderId = await createDriveFolder(context.client, newFolderName, context.newDestParentFolderId);
        context.destFolderId = newFolderId;
        context.destFolderName = newFolderName;
        context.state = MOVE_FILE_STATES.AWAITING_USER_EMAIL;
        await m.send(`New destination folder "${newFolderName}" created.\nNow, enter the email address of the user whose files you want to move. Type 'me' for your own files.`);
    } catch (error) {
        console.error(`Error creating new destination folder for ${context.jid}:`, error);
        await m.send("Failed to create the new destination folder. Please try again or choose a different option.");
        // Revert to destination option selection
        context.state = MOVE_FILE_STATES.SELECT_DESTINATION_OPTION;
        await m.send("Choose the destination:\n1. Select an existing folder\n2. Create a new folder in root\n3. Create a new folder inside another folder");
    }
}

async function handleUserEmailInput(m, context) {
    let userInput = m.message.trim();
    if (userInput.toLowerCase() === 'me') {
        // Get the authenticated user's email. This requires an additional API call or storing it during auth.
        // For simplicity, let's assume 'me' means we don't filter by owner, or use the authenticated user's email if available.
        // For now, we'll make it so 'me' implies no specific owner filter in the query, or a placeholder.
        // A proper implementation would fetch the user's profile email.
        const drive = google.drive({ version: 'v3', auth: context.client });
        try {
            const about = await drive.about.get({ fields: 'user' });
            context.targetUserEmail = about.data.user.emailAddress;
        } catch (e) {
            console.error("Could not fetch user's own email for 'me':", e);
            await m.send("Could not determine your email for 'me'. Please provide an email address, or this might not work as expected.");
            context.targetUserEmail = null; // Will likely result in moving files accessible to the bot account
        }

    } else if (!userInput.includes('@')) {
        context.targetUserEmail = `${userInput}@gmail.com`; // Simple assumption
    } else {
        context.targetUserEmail = userInput;
    }
    context.state = MOVE_FILE_STATES.AWAITING_MOVE_CONFIRMATION;
    const userMsgPart = context.targetUserEmail ? `owned by ${context.targetUserEmail} ` : '';
    await m.send(`Ready to move files ${userMsgPart}from "${context.sourceFolderName}" to "${context.destFolderName}".\nType 'confirm' to proceed or 'stop' to cancel.`);
}

async function handleMoveConfirmation(m, context) {
    if (m.message.toLowerCase().trim() === 'confirm') {
        await performFileMove(m, context);
    } else {
        await m.send("Move operation cancelled.");
    }
    userMoveFileContexts.delete(context.jid); // Clean up context
}


async function performFileMove(m, context) {
    const drive = google.drive({ version: 'v3', auth: context.client });
    try {
        let queryParts = [`'${context.sourceFolderId}' in parents`, `trashed = false`];
        if (context.targetUserEmail) { // Only add owner query if email is provided
            queryParts.push(`'${context.targetUserEmail}' in owners`);
        }
        const query = queryParts.join(' and ');
        
        console.log(`Move query for ${context.jid}: ${query}`);

        const res = await drive.files.list({
            q: query,
            fields: 'files(id, name)', // Only need ID for moving
            spaces: 'drive',
            pageSize: 200 // Fetch more files per page if expecting many
        });

        const filesToMove = res.data.files;
        if (!filesToMove || filesToMove.length === 0) {
            return await m.send("No files found matching the criteria in the source folder.");
        }

        await m.send(`Found ${filesToMove.length} file(s). Starting move operation... This might take a while.`);

        let movedCount = 0;
        let failedCount = 0;
        for (const file of filesToMove) {
            try {
                await drive.files.update({
                    fileId: file.id,
                    addParents: context.destFolderId,
                    removeParents: context.sourceFolderId,
                    fields: 'id, parents', // Request fields to confirm
                });
                movedCount++;
            } catch (updateError) {
                failedCount++;
                console.error(`Error moving file ${file.id} (${file.name}):`, updateError.message);
            }
        }
        let resultMessage = `Move operation completed.\nSuccessfully moved: ${movedCount} file(s).`;
        if (failedCount > 0) {
            resultMessage += `\nFailed to move: ${failedCount} file(s). Check bot logs for details.`;
        }
        await m.send(resultMessage);

    } catch (error) {
        console.error("Error performing file move:", error);
        let errorMsg = "An error occurred while moving files.";
        if (error.errors && error.errors[0] && error.errors[0].message) {
            errorMsg += ` Details: ${error.errors[0].message}`;
        }
        await m.send(errorMsg + "\nPlease check folder IDs, permissions, and user email validity.");
    }
}