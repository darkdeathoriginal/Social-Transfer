const { Module, onMessage } = require("../WA_index");
const {
  ClassDb,
  addClass,
  updateClass,
  deleteClass,
} = require("./sql/classroom");
const {
  listAnnouncements,
  listCourseWorkMaterials,
  listCourseWork,
  getCourses,
  getFile,
} = require("./notification");
const { fromBuffer } = require("file-type");
const { getCode } = require("./utils/server");
const { addShort } = require("./utils/urlshortner");
const { SERVER } = require("../config");
const {
  createClient,
  createUser,
  getGoogleClient,
} = require("./utils/googleClient");

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const userClassroomContexts = new Map();
const CONTEXT_TIMEOUT_MS = 5 * 60 * 1000;

const STATES = {
  MENU_CHOICE: "menu_choice",

  AWAITING_SETUP_NAME: "awaiting_setup_name",
  AWAITING_AUTH_CONFIRMATION: "awaiting_auth_confirmation",
  COURSE_SELECTION: "course_selection",
  AWAITING_FORWARD_JID: "awaiting_forward_jid",

  SELECT_SETUP_FOR_UPDATE: "select_setup_for_update",
  AWAITING_NEW_FORWARD_JID: "awaiting_new_forward_jid",

  SELECT_SETUP_FOR_DELETE: "select_setup_for_delete",

  SELECT_SETUP_FOR_DATA_LIST: "select_setup_for_data_list",
  SELECT_COURSE_FOR_DATA: "select_course_for_data",
  SELECT_DATA_TYPE: "select_data_type",
  SELECT_ITEM_FOR_DOWNLOAD: "select_item_for_download",
};

function clearContext(adminJid) {
  const context = userClassroomContexts.get(adminJid);
  if (context && context.timeoutId) {
    clearTimeout(context.timeoutId);
  }
  userClassroomContexts.delete(adminJid);
}

function setContextTimeout(adminJid) {
  const context = userClassroomContexts.get(adminJid);
  if (context) {
    if (context.timeoutId) {
      clearTimeout(context.timeoutId);
    }
    context.timeoutId = setTimeout(() => {
      if (userClassroomContexts.has(adminJid)) {
        console.log(`Classroom context for ${adminJid} timed out.`);
        clearContext(adminJid);
      }
    }, CONTEXT_TIMEOUT_MS);
  }
}

Module(
  {
    pattern: "classroom",
    fromMe: true,
    desc: "Google Classroom notification setup command",
    use: "utility",
  },
  async (m, match) => {
    const adminJid = m.jid;

    if (userClassroomContexts.has(adminJid)) {
      return await m.send(
        "You are already in a classroom setup process. Type 'stop' to cancel the current one."
      );
    }

    const context = {
      state: STATES.MENU_CHOICE,
      adminJid: adminJid,
    };
    userClassroomContexts.set(adminJid, context);
    setContextTimeout(adminJid);

    let msg =
      "Google Classroom Setup:\n" +
      "1. Add new notification setup\n" +
      "2. Change notification JID for an existing setup\n" +
      "3. Remove a notification setup\n" +
      "4. Get data from a course (announcements, coursework, etc.)";
    await m.send(msg);
  }
);

onMessage(
  {
    pattern: "message",
    fromMe: true /* desc: "Handles classroom setup messages" */,
  },
  async (m, match) => {
    const adminJid = m.jid;
    const context = userClassroomContexts.get(adminJid);

    if (context && m.message && m.message.toLowerCase() !== ".classroom") {
      setContextTimeout(adminJid);

      if (m.message.toLowerCase() === "stop") {
        clearContext(adminJid);

        return await m.send("Classroom setup process stopped.");
      }

      try {
        const handlerFunctionName = `handleState_${context.state}`;
        if (typeof stateHandlers[handlerFunctionName] === "function") {
          await stateHandlers[handlerFunctionName](m, context);
        } else {
          console.warn(`No handler for classroom state: ${context.state}`);
          await m.send(
            "I'm a bit lost. Please type 'stop' and start over if needed."
          );
        }
      } catch (error) {
        console.error(
          `Error in classroom state [${context.state}] for ${adminJid}:`,
          error
        );
        await m.send(
          `An error occurred: ${
            error.message || "Unknown error"
          }. Process stopped. Please try again.`
        );

        clearContext(adminJid);
      }
    }
  }
);

const stateHandlers = {
  async handleState_menu_choice(m, context) {
    const choice = parseInt(m.message.trim());
    if (isNaN(choice)) {
      await m.send(
        "Invalid input. Please send a number corresponding to the menu option."
      );
      return listMainMenu(m);
    }

    switch (choice) {
      case 1:
        context.state = STATES.AWAITING_SETUP_NAME;
        await m.send(
          "Please provide a unique name for this classroom setup (e.g., 'Math_Class_Notifications')."
        );
        break;
      case 2:
        context.actionType = "update";
        await listExistingSetups(
          m,
          context,
          STATES.SELECT_SETUP_FOR_UPDATE,
          "Which setup's notification JID do you want to change?"
        );
        break;
      case 3:
        context.actionType = "delete";
        await listExistingSetups(
          m,
          context,
          STATES.SELECT_SETUP_FOR_DELETE,
          "Which setup do you want to remove?"
        );
        break;
      case 4:
        context.actionType = "get_data";
        await listExistingSetups(
          m,
          context,
          STATES.SELECT_SETUP_FOR_DATA_LIST,
          "Which setup's data do you want to access?"
        );
        break;
      default:
        await m.send("Invalid option. Please select a number from the menu.");
        await listMainMenu(m);
    }
  },

  async handleState_awaiting_setup_name(m, context) {
    const setupName = m.message.trim();
    if (!setupName) {
      return await m.send("Setup name cannot be empty. Please provide a name.");
    }

    await ClassDb.sync();
    const existing = await ClassDb.findOne({ where: { name: setupName } });
    if (existing) {
      return await m.send(
        `A setup named "${setupName}" already exists. Please choose a different name, or delete the existing one first.`
      );
    }
    context.setupName = setupName;
    context.state = STATES.AWAITING_AUTH_CONFIRMATION;

    const tempOAuthClient = createClient();
    context.tempOAuthClient = tempOAuthClient;
    const authUrl = tempOAuthClient.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES,
      state: context.adminJid,
    });
    const shortId = await addShort(authUrl);
    const fullShortUrl = `${SERVER}/short/${shortId}`;

    await m.send(
      `Authorization needed for setup "${setupName}".\nPlease visit: ${fullShortUrl}\nOnce authorized, the setup will continue.`
    );

    try {
      const authCode = await getCode();

      if (
        !userClassroomContexts.has(context.adminJid) ||
        userClassroomContexts.get(context.adminJid).state !==
          STATES.AWAITING_AUTH_CONFIRMATION
      ) {
        console.log(
          "Auth code received but context changed/cleared for " +
            context.adminJid
        );
        return;
      }

      const { tokens } = await context.tempOAuthClient.getToken(authCode);

      await createUser(context.setupName, tokens);

      context.state = STATES.COURSE_SELECTION;
      await m.send("Account authorized successfully for this setup!");
      await listCoursesForSelection(m, context);
    } catch (error) {
      console.error("OAuth error for setup", context.setupName, error);
      await m.send(
        "Authorization failed or timed out. Please try adding the setup again."
      );

      clearContext(context.adminJid);
    }
  },

  async handleState_course_selection(m, context) {
    const choice = m.message.trim();
    const selectedIndices = choice
      .split(",")
      .map((num) => parseInt(num.trim()));

    if (selectedIndices.some(isNaN)) {
      await m.send(
        "Invalid input. Please send numbers separated by commas (e.g., 1,3) or '0' for all."
      );
      return await listCoursesForSelection(m, context);
    }

    const allCourses = context.coursesForSelection;
    if (!allCourses) {
      await m.send("Course list not found. Please try again.");
      clearContext(context.adminJid);
      return;
    }

    if (selectedIndices.includes(0)) {
      context.selectedCourses = allCourses;
    } else {
      context.selectedCourses = [];
      for (const index of selectedIndices) {
        if (index > 0 && index <= allCourses.length) {
          context.selectedCourses.push(allCourses[index - 1]);
        } else {
          await m.send(
            `Invalid course number: ${index}. Please select from the list.`
          );
          return await listCoursesForSelection(m, context);
        }
      }
    }

    if (context.selectedCourses.length === 0) {
      await m.send("No courses selected. Please make a valid selection.");
      return await listCoursesForSelection(m, context);
    }

    context.state = STATES.AWAITING_FORWARD_JID;
    let courseNames = context.selectedCourses
      .map((c) => c.name || c.descriptionHeading)
      .join(", ");
    await m.send(
      `Selected courses: ${courseNames}.\nNow, send the WhatsApp JID where notifications should be sent (e.g., 1234567890@s.whatsapp.net or a groupJID). Type 'this' to use the current chat.`
    );
  },

  async handleState_awaiting_forward_jid(m, context) {
    const forwardJidInput = m.message.trim();
    if (forwardJidInput.toLowerCase() === "this") {
      context.forwardJid = context.adminJid;
    } else if (isValidJid(forwardJidInput)) {
      context.forwardJid = forwardJidInput;
    } else {
      return await m.send(
        "Invalid JID format. Please send a valid WhatsApp JID or type 'this'."
      );
    }

    const coursesToStoreInDb = context.selectedCourses.map((course) => ({
      id: course.id,
      name: course.name || c.descriptionHeading,
    }));

    const initialLastCheckedStates = {};
    coursesToStoreInDb.forEach((c) => {
      initialLastCheckedStates[c.id] = {
        lastAnnouncementTimestamp: 0,
        lastCourseWorkTimestamp: 0,
        lastMaterialTimestamp: 0,
      };
    });

    const classDbDataPayload = {
      courses: coursesToStoreInDb,
      forward_jid: context.forwardJid,
      last_checked_states: initialLastCheckedStates,
      is_active: true,
      admin_jid: context.adminJid,
    };

    await ClassDb.sync();
    await addClass(context.setupName, classDbDataPayload);

    await m.send(
      `Notification setup "${context.setupName}" for JID ${context.forwardJid} completed for the selected courses! Polling will begin if configured.`
    );
    clearContext(context.adminJid);
  },

  async handleState_select_setup_for_update(m, context) {
    const choice = parseInt(m.message.trim());
    const setups = context.dataCacheForListing;
    if (setups && choice > 0 && choice <= setups.length) {
      context.selectedSetupName = setups[choice - 1].name;
      context.selectedSetupData = setups[choice - 1];
      context.state = STATES.AWAITING_NEW_FORWARD_JID;
      await m.send(
        `Selected setup: "${
          context.selectedSetupName
        }".\nCurrent notification JID is: ${
          setups[choice - 1].forward_jid
        }.\nEnter the new JID (or type 'stop' to cancel).`
      );
    } else {
      await m.send("Invalid selection.");
      await listExistingSetups(
        m,
        context,
        STATES.SELECT_SETUP_FOR_UPDATE,
        "Which setup's JID to change?"
      );
    }
  },

  async handleState_awaiting_new_forward_jid(m, context) {
    const newJidInput = m.message.trim();
    let newJid;
    if (newJidInput.toLowerCase() === "this") {
      newJid = context.adminJid;
    } else if (isValidJid(newJidInput)) {
      newJid = newJidInput;
    } else {
      return await m.send(
        "Invalid JID format. Please send a valid WhatsApp JID or type 'this'."
      );
    }

    const dataToUpdate = {
      ...context.selectedSetupData.data,
      forward_jid: newJid,
    };

    const success = await updateClass(context.selectedSetupName, dataToUpdate);

    if (success) {
      await m.send(
        `Successfully updated notification JID for "${context.selectedSetupName}" to ${newJid}.`
      );
    } else {
      await m.send(
        `Failed to update JID for "${context.selectedSetupName}". It might not exist anymore.`
      );
    }
    clearContext(context.adminJid);
  },

  async handleState_select_setup_for_delete(m, context) {
    const choice = parseInt(m.message.trim());
    const setups = context.dataCacheForListing;
    if (setups && choice > 0 && choice <= setups.length) {
      const setupNameToDelete = setups[choice - 1].name;
      await deleteClass(setupNameToDelete);
      await m.send(
        `Setup "${setupNameToDelete}" has been removed successfully.`
      );
    } else {
      await m.send("Invalid selection.");
      await listExistingSetups(
        m,
        context,
        STATES.SELECT_SETUP_FOR_DELETE,
        "Which setup to remove?"
      );
    }
    clearContext(context.adminJid);
  },

  async handleState_select_setup_for_data_list(m, context) {
    const choice = parseInt(m.message.trim());
    const setups = context.dataCacheForListing;
    if (setups && choice > 0 && choice <= setups.length) {
      context.selectedSetupName = setups[choice - 1].name;
      context.selectedSetupData = setups[choice - 1];
      context.state = STATES.SELECT_COURSE_FOR_DATA;

      let courseListMsg = `Selected setup: "${context.selectedSetupName}".\nWhich course's data do you want to fetch?\n`;
      context.selectedSetupData.courses.forEach((course, index) => {
        courseListMsg += `${index + 1}. ${course.name} (${course.id})\n`;
      });
      if (context.selectedSetupData.courses.length === 0) {
        await m.send(
          "This setup has no courses configured. Cannot fetch data."
        );
        return clearContext(context.adminJid);
      }
      context.dataCacheForListing = context.selectedSetupData.courses;
      await m.send(courseListMsg);
    } else {
      await m.send("Invalid selection.");
      await listExistingSetups(
        m,
        context,
        STATES.SELECT_SETUP_FOR_DATA_LIST,
        "Which setup's data?"
      );
    }
  },

  async handleState_select_course_for_data(m, context) {
    const choice = parseInt(m.message.trim());
    const courses = context.dataCacheForListing;
    if (courses && choice > 0 && choice <= courses.length) {
      context.selectedCourseIdForData = courses[choice - 1].id;
      context.selectedCourseNameForData = courses[choice - 1].name;
      context.state = STATES.SELECT_DATA_TYPE;
      await m.send(
        `Selected course: "${context.selectedCourseNameForData}".\nWhat type of data do you want?\n1. Announcements\n2. Course Work (Assignments)\n3. Course Work Materials`
      );
    } else {
      await m.send("Invalid course selection.");

      let courseListMsg = `Invalid selection for setup "${context.selectedSetupName}".\nWhich course's data?\n`;
      courses.forEach((course, index) => {
        courseListMsg += `${index + 1}. ${course.name}\n`;
      });
      await m.send(courseListMsg);
    }
  },

  async handleState_select_data_type(m, context) {
    const choice = parseInt(m.message.trim());
    const authorizedGcClient = await getGoogleClient(context.selectedSetupName);
    if (!authorizedGcClient) {
      await m.send(
        "Could not get authorization for this setup. Please try again."
      );
      return clearContext(context.adminJid);
    }
    context.client = authorizedGcClient;

    let items = [];
    let itemType = "";
    switch (choice) {
      case 1:
        items = await listAnnouncements(
          context.selectedCourseIdForData,
          context.client
        );
        itemType = "Announcement";
        break;
      case 2:
        items = await listCourseWork(
          context.selectedCourseIdForData,
          context.client
        );
        itemType = "Course Work";
        break;
      case 3:
        items = await listCourseWorkMaterials(
          context.selectedCourseIdForData,
          context.client
        );
        itemType = "Material";
        break;
      default:
        await m.send("Invalid data type selection.");
        return;
    }

    const driveFiles = extractDriveFilesFromItems(items, itemType);

    if (driveFiles.length === 0) {
      await m.send(
        `No downloadable files found in ${itemType}s for course "${context.selectedCourseNameForData}".`
      );

      context.state = STATES.SELECT_COURSE_FOR_DATA;

      return;
    }

    let fileListMsg = `Found ${driveFiles.length} downloadable file(s) in ${itemType}s for "${context.selectedCourseNameForData}":\n`;
    context.dataCacheForListing = driveFiles;
    driveFiles.forEach((file, index) => {
      fileListMsg += `${index + 1}. ${file.title} (from: ${
        file.sourceItemTitle
      })\n`;
    });
    fileListMsg += "0. Download all files";
    context.state = STATES.SELECT_ITEM_FOR_DOWNLOAD;
    await m.send(fileListMsg);
  },

  async handleState_select_item_for_download(m, context) {
    const choice = parseInt(m.message.trim());
    const filesToDownload = context.dataCacheForListing;

    if (!filesToDownload) {
      await m.send(
        "File list not found. Please start the data fetching again."
      );
      return clearContext(context.adminJid);
    }

    const filesToProcess = [];
    if (choice === 0) {
      filesToProcess.push(...filesToDownload);
    } else if (choice > 0 && choice <= filesToDownload.length) {
      filesToProcess.push(filesToDownload[choice - 1]);
    } else {
      await m.send(
        "Invalid selection. Please choose a number from the list or 0 for all."
      );

      return;
    }

    if (filesToProcess.length > 0) {
      await m.send(`Preparing to download ${filesToProcess.length} file(s)...`);
      for (const file of filesToProcess) {
        try {
          let exportMimeType;
          let finalFileName = file.title || "downloaded_file";

          if (file.mimeType === "application/vnd.google-apps.document") {
            exportMimeType =
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            if (!finalFileName.toLowerCase().endsWith(".docx"))
              finalFileName += ".docx";
          } else if (
            file.mimeType === "application/vnd.google-apps.spreadsheet"
          ) {
            exportMimeType =
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            if (!finalFileName.toLowerCase().endsWith(".xlsx"))
              finalFileName += ".xlsx";
          } else if (
            file.mimeType === "application/vnd.google-apps.presentation"
          ) {
            exportMimeType =
              "application/vnd.openxmlformats-officedocument.presentationml.presentation";
            if (!finalFileName.toLowerCase().endsWith(".pptx"))
              finalFileName += ".pptx";
          } else {
            exportMimeType = "application/pdf";
            if (
              file.mimeType &&
              file.mimeType.startsWith("application/vnd.google-apps") &&
              !finalFileName.toLowerCase().endsWith(".pdf")
            ) {
              finalFileName += ".pdf";
            }
          }

          const buffer = await getFile(
            file.id,
            file.mimeType,
            context.client,
            exportMimeType
          );
          if (buffer) {
            let fileTypeResult = await fromBuffer(buffer);
            let sendMimeType = fileTypeResult
              ? fileTypeResult.mime
              : "application/octet-stream";

            if (
              file.mimeType &&
              file.mimeType.startsWith("application/vnd.google-apps")
            ) {
              sendMimeType = exportMimeType;
            }

            await m.client.sendMessage(context.adminJid, {
              document: buffer,
              fileName: finalFileName,
              mimetype: sendMimeType,
              caption: `File: ${file.title}\nFrom: ${file.sourceItemTitle}`,
            });
          } else {
            await m.send(`Could not download/export file: ${file.title}`);
          }
        } catch (dlError) {
          console.error(
            `Error processing file for download ${file.title} (ID: ${file.id}):`,
            dlError
          );
          await m.send(`Failed to process file for download: ${file.title}`);
        }
      }
      await m.send("Downloads complete (or attempted).");
    }

    clearContext(context.adminJid);
  },
};

function isValidJid(jid) {
  return jid && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@g.us"));
}

async function listMainMenu(m) {
  let msg =
    "Google Classroom Setup:\n" +
    "1. Add new notification setup\n" +
    "2. Change notification JID\n" +
    "3. Remove a notification setup\n" +
    "4. Get data from a course";
  await m.send(msg);
}

async function listExistingSetups(m, context, nextState, messagePrefix) {
  const allSetupsFromDb = await ClassDb.findAll();

  if (!allSetupsFromDb || allSetupsFromDb.length === 0) {
    await m.send(
      "No classroom setups found. Please add one first using option 1 from the main menu."
    );
    clearContext(context.adminJid);
    return;
  }

  let setupListMsg = messagePrefix + "\n";

  const processedSetups = allSetupsFromDb.map((setupInstance) => {
    const setupData = setupInstance.get({ plain: true });

    return {
      name: setupData.name,
      forward_jid: setupData.data.forward_jid,
      courses: setupData.data.courses,

      original_data_blob: setupData.data,
    };
  });

  context.dataCacheForListing = processedSetups;

  if (processedSetups.length === 0) {
    await m.send(
      "No classroom setups found after processing. Please add one first."
    );
    clearContext(context.adminJid);
    return;
  }

  processedSetups.forEach((setup, index) => {
    const courseCount = setup.courses ? setup.courses.length : 0;
    setupListMsg += `${index + 1}. ${setup.name} (Notifying: ${
      setup.forward_jid || "N/A"
    }, Courses: ${courseCount})\n`;
  });

  context.state = nextState;
  await m.send(setupListMsg);
}
async function listCoursesForSelection(m, context) {
  try {
    const authorizedGcClient = await getGoogleClient(context.setupName);
    if (!authorizedGcClient)
      throw new Error("Authorization failed for this setup name.");

    const courses = await getCourses(authorizedGcClient);
    if (!courses || courses.length === 0) {
      await m.send(
        "No courses found for your Google account, or failed to fetch them."
      );
      clearContext(context.adminJid);
      return;
    }
    context.coursesForSelection = courses.map((c) => ({
      id: c.id,
      name: c.name || c.descriptionHeading,
    }));

    let courseListMsg = "Available courses:\n";
    context.coursesForSelection.forEach((course, index) => {
      courseListMsg += `${index + 1}. ${course.name} (${course.id})\n`;
    });
    courseListMsg +=
      "0. Select ALL courses\nReply with numbers separated by commas (e.g., 1,3) or 0 for all.";
    await m.send(courseListMsg);
  } catch (error) {
    console.error("Error listing courses for selection:", error);
    await m.send("Could not fetch courses. " + (error.message || ""));
    clearContext(context.adminJid);
  }
}

function extractDriveFilesFromItems(items, itemType) {
  const driveFiles = [];
  if (!items || !Array.isArray(items)) return driveFiles;

  items.forEach((item) => {
    const sourceTitle = item.text || item.title || `Untitled ${itemType}`;
    if (item.materials && Array.isArray(item.materials)) {
      item.materials.forEach((material) => {
        if (material.driveFile && material.driveFile.driveFile) {
          driveFiles.push({
            id: material.driveFile.driveFile.id,
            title: material.driveFile.driveFile.title,
            mimeType: material.driveFile.driveFile.mimeType,
            sourceItemTitle: sourceTitle,
          });
        }
      });
    }
  });
  return driveFiles;
}
