const { client } = require("../WA_index");
require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
const { ClassDb, updateClass, UserDb } = require("./sql/classroom");
const { onMessage } = require("../WA_index");
const { fromBuffer } = require("file-type");

const credsPath = "../creds.json";
const RUN = process.env.NOTIFICATION ? process.env.NOTIFICATION : false;
let gcClients = {};
let array = {};
let tries = 0;

async function main(obj) {
  try {
    let gcClient;
    if (gcClients[obj.name]) {
      gcClient = gcClients[obj.name];
    } else {
      const creds = require(credsPath);
      const { client_id, client_secret, redirect_uris } = creds.web;
      gcClient = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris
      );
      await authorize();
      gcClients[obj.name] = gcClient;
    }
    while (true) {
      const { cources, forward, state } = obj.data;
      for (let i of cources) {
        let haschange = false;
        let list = {};
        let announcements = await listAnnouncements(i.id, gcClient);
        let courseWorks = await listCourseWork(i.id, gcClient);
        let courseWorkMaterials = await listCourseWorkMaterials(i.id, gcClient);
        if(!state[i.id]["announcement"]) state[i.id]["announcement"] = announcements[0]?.id;haschange = true;
        if(!state[i.id]["courseWork"]) state[i.id]["courseWork"] = courseWorks[0]?.id;haschange = true;
        if(!state[i.id]["courseWorkMaterial"]) state[i.id]["courseWorkMaterial"] = courseWorkMaterials[0]?.id;haschange = true;
        for (let k = 0; k < announcements.length; k++) {
          if (state[i.id]["announcement"] == announcements[k].id) {
            for (let j = 0; j < k; j++) {
              haschange = true;
              const { text } = announcements[j];
              let msg = `*${i.name}*\n> Announcement\n\n${text.split("\n").map((i) =>"_"+i+"_").join("\n")}`;
              if (announcements[j].materials) {
                msg += "\n\n*Materials*";
                let n = 1;
                for (let m of announcements[j].materials) {
                  if (m.driveFile) {
                    const { id, title, alternateLink } = m.driveFile.driveFile;
                    list[n] = { id, title, name: obj.name };
                    msg += `\n> ${title} : ${alternateLink}`;
                    n++;
                  }
                  if (m.link) {
                    msg += `\n> ${m.link.url}`;
                  }
                }
              }
              let a = await client.sendMessage(forward, { text: msg });
              if(list[1]){
                array[a.key.id] = list;
                list = [];
              }
            }
            break;
          }
        }
        if (announcements[0]?.id) {
          state[i.id]["announcement"] = announcements[0].id;
        }
        for (let k = 0; k < courseWorks.length; k++) {
          if (state[i.id]["courseWork"] == courseWorks[k].id) {
            for (let j = 0; j < k; j++) {
              haschange = true;
              const { title, description, dueDate, materials } = courseWorks[j];
              let msg = `*${i.name}*\n> Assignment\n\n${title}`;
              if (description) {
                msg += `\n*Instruction*\n${description.split("\n").map((i) =>"_"+i+"_").join("\n")}`;
              }
              if (dueDate) {
                msg += `\n> Due date : ${dueDate.day}-${dueDate.month}-${dueDate.year}`;
              }

              if (materials) {
                msg += "\n\n*Materials*";
                let n = 1;
                for (let m of materials) {
                  if (m.driveFile) {
                    const { id, title, alternateLink } = m.driveFile.driveFile;
                    list[n] = { id, title, name: obj.name };
                    msg += `\n> ${title} : ${alternateLink}`;
                    n++;
                  }
                  if (m.link) {
                    msg += `\n> ${m.link.url}`;
                  }
                }
              }
              let a = await client.sendMessage(forward, { text: msg });
              if(list[1]){
                array[a.key.id] = list;
                list = [];
              }
            }
            break;
          }
        }
        if (courseWorks[0]?.id) {
          state[i.id]["courseWork"] = courseWorks[0].id;
        }
        for (let k = 0; k < courseWorkMaterials.length; k++) {
          if (state[i.id]["courseWorkMaterial"] == courseWorkMaterials[k].id) {
            for (let j = 0; j < k; j++) {
              haschange = true;
              const { title, description, materials } = courseWorkMaterials[j];
              let msg = `*${i.name}*\n> Materials\n\n${title}`;
              if (description) {
                msg += `\n${description.split("\n").map((i) =>"_"+i+"_").join("\n")}`;
              }

              if (materials) {
                msg += "\n\n*Materials*";
                let n = 1;
                for (let m of materials) {
                  if (m.driveFile) {
                    const { id, title, alternateLink } = m.driveFile.driveFile;
                    list[n] = { id, title, name: obj.name };
                    msg += `\n> ${title} : ${alternateLink}`;
                    n++;
                  }
                  if (m.link) {
                    msg += `\n> ${m.link.url}`;
                  }
                }
              }
              let a = await client.sendMessage(forward, { text: msg });
              if(list[1]){
                array[a.key.id] = list;
                list = [];
              }
            }
            break;
          }
        }
        if (courseWorkMaterials[0]?.id) {
          state[i.id]["courseWorkMaterial"] = courseWorkMaterials[0].id;
        }
        let data = {
          cources,
          forward,
          state,
        };
        if (haschange) {
          await updateClass(obj.name, data);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * 60));
    }
    async function getAuthToken() {
      const token = await UserDb.findOne({ where: { name: obj.name } });
      return token;
    }

    async function verifyAndUpdateToken(token) {
      const json = await UserDb.findOne({ where: { name: obj.name } });

      if (token !== json.access_token) {
        json.access_token = token;
        await json.save();
      }
    }

    async function authorize() {
      const authToken = await getAuthToken();
      gcClient.setCredentials(authToken);
      const { token } = await gcClient.getAccessToken();
      verifyAndUpdateToken(token);
    }
  } catch (e) {
    const util = require("util");
    console.log(e);
    tries++;
    await client.sendMessage("919072215994@s.whatsapp.net", {
      text: util.format(e),
    });
    if (tries < 10) {
      main(obj);
    }
  }
}
async function mn() {
  if (RUN && RUN == "on") {
    await ClassDb.sync();
    let cources = await ClassDb.findAll();
    for (let i of cources) {
      main(i);
    }
  }
}
mn();
async function listAnnouncements(COURSEID, gcClient) {
  const classroom = google.classroom({ version: "v1", auth: gcClient });

  const allAnnouncements = [];

  const {
    data: { announcements },
  } = await classroom.courses.announcements.list({
    courseId: COURSEID,
  });
  if (announcements) {
    allAnnouncements.push(...announcements);
  }

  return allAnnouncements;
}

async function listCourseWork(COURSEID, gcClient) {
  const classroom = google.classroom({ version: "v1", auth: gcClient });

  const allCourseWork = [];

  const {
    data: { courseWork },
  } = await classroom.courses.courseWork.list({
    courseId: COURSEID,
  });

  if (courseWork) {
    allCourseWork.push(...courseWork);
  }

  return allCourseWork;
}
async function listCourseWorkMaterials(COURSEID, gcClient) {
  const classroom = google.classroom({ version: "v1", auth: gcClient });

  const allCourseWork = [];

  const {
    data: { courseWorkMaterial },
  } = await classroom.courses.courseWorkMaterials.list({
    courseId: COURSEID,
  });

  if (courseWorkMaterial) {
    allCourseWork.push(...courseWorkMaterial);
  }

  return allCourseWork;
}
async function getCourses(client) {
  const classroom = google.classroom({ version: "v1", auth: client });
  const {
    data: { courses },
  } = await classroom.courses.list();
  return courses;
}
async function getTeachers(COURSEID, gcClient) {
  const classroom = google.classroom({ version: "v1", auth: gcClient });

  return (
    await classroom.courses.teachers.list({
      courseId: COURSEID,
    })
  ).data.teachers;
}
async function getFile(fileId, gcClient) {
  const drive = google.drive({ version: "v3", auth: gcClient });

  try {
    const res = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    return Buffer.from(res.data);
  } catch (err) {
    console.log(err);
    return null;
  }
}

onMessage(
  { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
  async (m, match) => {
    if (array[m.reply_message?.id]) {
      var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false;
      if (!no) throw "_Reply must be  a number_";
      let data = array[m.reply_message.id];
      if (no == "0") {
        for (let i of Object.values(data)) {
          const { id, title, name } = i;
          let buffer = await getFile(id, gcClients[name]);
          let { mime } = await fromBuffer(buffer);
          await m.client.sendMessage(m.jid, {
            document: buffer,
            fileName: title,
            mimetype: mime,
          });
        }
      } else if (data[no]) {
        const { id, title, name } = data[no];
        let buffer = await getFile(id, gcClients[name]);
        let { mime } = await fromBuffer(buffer);
        return await m.client.sendMessage(m.jid, {
          document: buffer,
          fileName: title,
          mimetype: mime,
        });
      } else {
        return await m.send("invalid number");
      }
    } else {
      return 0;
    }
  }
);

module.exports = {
  getFile,
  listAnnouncements,
  listCourseWorkMaterials,
  listCourseWork,
  gcClients,
  getCourses,
  main,
};
