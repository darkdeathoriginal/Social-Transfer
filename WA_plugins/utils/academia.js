const axios = require("axios");
const academiaDb = require("../sql/academia");

async function getToken(username, password) {
  const apiUrl = "https://academia-s.azurewebsites.net/login";
  const requestBody = {
    username,
    password,
  };
  return new Promise((resolve, reject) => {
    axios
      .post(apiUrl, requestBody)
      .then((res) => {
        resolve(res.data);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

async function getDetails(token) {
  const apiUrl = "https://academia-s.azurewebsites.net/course-user";
  const config = {
    headers: {
      "X-Access-Token": token,
    },
  };

  return new Promise((resolve, reject) => {
    axios
      .post(apiUrl, null, config)
      .then((res) => {
        resolve(res.data);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

async function existingUser(netid){
  await academiaDb.sync()
  const user = await academiaDb.findOne({where:{netid}})
  return Boolean(user)
}

async function addUser(netid,token,phoneNUmber){
  if(await existingUser(netid)) return
  await academiaDb.sync()
  let a = await academiaDb.create({netid,token,jid:phoneNUmber+"@s.whatsapp.net"})
  let details = await getDetails(token)
  let data = filterCources(details)
  a.dataValues.data = data
  return await a.save()
}
function filterCources(details){
  let data = {}
  if(details?.courses){
    for(let i of details.courses){
      data[i.subject_name]={
        name:i.subject_name,
        conducted:i.conducted_hours,
        absent:i.absent_hours
      }
    }
  }
  return data
}

module.exports = {
  getToken,
  getDetails,
  existingUser,
  addUser,
  filterCources
};
