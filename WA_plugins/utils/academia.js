const axios = require("axios");
const academiaDb = require("../sql/academia");
const qs = require("qs")
const cheerio = require("cheerio")

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
  let details = await getAttendance(token)
  let data = filterCources(details)
  let a = await academiaDb.create({netid,token,jid:phoneNUmber+"@s.whatsapp.net",data})
  return await a.save()
}
function filterCources(details){
  let data = {}
  if(details?.length>1){
    for(let i of details){
      data[i.code]=i
    }
  }
  return data
}

async function getCookie(username, password) {
  return new Promise(async (resolve, reject) => {
    try {
      const response1 = await axios.get("https://academia.srmist.edu.in/");
      const cookies = response1.headers["set-cookie"];
      let cookie;
      for (let i of cookies) {
        if (i.match("zccpn=")) {
          cookie = i.replace("zccpn=", "").split(";")[0];
        }
      }

      const data1 = qs.stringify({
        mode: "primary",
        servicename: "ZohoCreator",
        service_language: "en",
        serviceurl: "https://academia.srmist.edu.in/",
      });

      const config1 = {
        method: "post",
        maxBodyLength: Infinity,
        url:
          "https://academia.srmist.edu.in/accounts/p/10002227248/signin/v2/lookup/" +username,
        headers: {
          Origin: "https://academia.srmist.edu.in",
          Host: "academia.srmist.edu.in",
          Cookie: `iamcsr=${cookie}; _zcsr_tmp=${cookie};`,
          "x-zcsrf-token": `iamcsrcoo=${cookie}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        data: data1,
      };

      const response2 = await axios.request(config1);
      if(!response2?.data?.lookup?.digest){
        resolve({error:"invalid username"})
      }
      const digest = response2.data.lookup.digest;
      const identifier = response2.data.lookup.identifier

      const data2 = JSON.stringify({
        passwordauth: {
          password: password,
        },
      });

      const config2 = {
        method: "post",
        maxBodyLength: Infinity,
        url: `https://academia.srmist.edu.in/accounts/p/10002227248/signin/v2/primary/${identifier}/password?digest=${digest}&cli_time=1695726627526&servicename=ZohoCreator&service_language=en&serviceurl=https%3A%2F%2Facademia.srmist.edu.in%2F`,
        headers: {
          Cookie: `iamcsr=${cookie}; _zcsr_tmp=${cookie};`,
          "x-zcsrf-token": `iamcsrcoo=${cookie}`,
          "Content-Type": "application/json",
        },
        data: data2,
      };

      const response3 = await axios.request(config2);
      if(response3.data?.errors){
        resolve({error:"Invalid password"})
      }
      const cookies2 = response3.headers["set-cookie"];
      let cookie2 = "";
      for (let i of cookies2) {
        cookie2 += i.split(";")[0] + ";";
      }
      cookie2 += `CT_CSRF_TOKEN=${cookie};iamcsr=${cookie}; _zcsr_tmp=${cookie};ZCNEWUIPUBLICPORTAL=true`;
      resolve(cookie2);
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
}

async function getAttendance(cookie){
  return new Promise(async(resolve, reject) => {
    try {
      const config3 = {
                method: 'get',
                maxBodyLength: Infinity,
                url: `https://academia.srmist.edu.in/srm_university/academia-academic-services/page/My_Attendance`,
                headers: {
                  'Cookie': cookie,
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
              };
    let resp = (await axios.request(config3)).data
    // console.log(resp);
    let a = resp.HTML.split("sanitize('")[1].split("');function doa")[0]
    a= a.replaceAll("\\x","%")
    a= unescape(a)
    const ch = cheerio.load(a);
    const article = [];
    let test = ch("div>table")
    test = ch("tbody>tr",test[2])
    test=test.slice(1,test.length)
    const data = []
    test.each(function () {
        const t = ch('td',this)
        const code = ch(t[0]).text().replace("Regular","")
        const title = ch(t[1]).text()
        const category = ch(t[2]).text()
        const faculty = ch(t[3]).text().split(" (")[0]
        const slot = ch(t[4]).text()
        const conducted = ch(t[5]).text()
        const absent = ch(t[6]).text()
        const percetage = ch(t[7]).text()
        const margin = Math.floor(((conducted-absent)/3)-absent)
        data.push({code,title,category,faculty,slot,conducted,absent,percetage,margin})
      });
      resolve(data)
    } catch (error) {
      reject(error)
    }
  })
}

module.exports = {
  getToken,
  getDetails,
  existingUser,
  addUser,
  filterCources,
  getCookie,
  getAttendance
};
