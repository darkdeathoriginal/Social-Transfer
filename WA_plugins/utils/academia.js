const express = require('express');
const https = require('https');
const fetch = require("node-fetch")
const fs = require('fs');
const app = express();
const port = 5001; 
let server;
if(fs.existsSync("/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/")){

  const privateKey = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/privkey.pem', 'utf8');
  const certificate = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/cert.pem', 'utf8');
  const ca = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/chain.pem', 'utf8'); 
  
  const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca, 
  };
  
  server = https.createServer(credentials, app);
}
app.use(express.urlencoded({ extended: true }));
app.get('/', async(req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`<style>
    body {
      align-items: center;
      background-color: #000;
      display: flex;
      justify-content: center;
      height: 100vh;
    }
    form {
      background-color: #15172b;
      border-radius: 20px;
      box-sizing: border-box;
      height: auto;
      padding: 20px;
      width: 40%;
      margin-bottom: 500px;
      margin-top: 500px;
    }
  
    label {
      display: block;
      margin-bottom: 10px;
      font-weight: bold;
    }
  
    .input {
      background-color: #303245;
      border-radius: 12px;
      border: 0;
      box-sizing: border-box;
      color: #eee;
      font-size: 18px;
      height: 100%;
      outline: 0;
      padding: 4px 20px 0;
      width: 100%;
    }
  
    input[type="submit"] {
      background-color: #08d;
      border-radius: 12px;
      border: 0;
      box-sizing: border-box;
      color: #eee;
      cursor: pointer;
      font-size: 18px;
      height: 50px;
      margin-top: 38px;
      /* outline: 0; */
      text-align: center;
      width: 100%;
    }
  
    .title {
      color: #eee;
      font-family: sans-serif;
      font-size: 36px;
      font-weight: 600;
      margin-top: 30px;
      text-align: center;
    }
  
    .subtitle {
      color: #eee;
      font-family: sans-serif;
      font-size: 16px;
      font-weight: 600;
      margin-top: 10px;
    }
  
    .input-container {
      height: 50px;
      position: relative;
      width: 100%;
    }
    .cut {
    background-color: #15172b;
    border-radius: 10px;
    height: 20px;
    left: 20px;
    position: absolute;
    top: -20px;
    transform: translateY(0);
    transition: transform 200ms;
    width: 76px;
  }
  .input:focus ~ .cut,
  .input:not(:placeholder-shown) ~ .cut {
    transform: translateY(8px);
  }
  
    .ic1 {
      margin-top: 40px;
    }
    .placeholder {
      color: #65657b;
      font-family: sans-serif;
      left: 20px;
      line-height: 14px;
      pointer-events: none;
      position: absolute;
      transform-origin: 0 50%;
      transition: transform 200ms, color 200ms;
      top: 20px;
    }
  
    .input:focus ~ .placeholder,
    .input:not(:placeholder-shown) ~ .placeholder {
      transform: translateY(-30px) translateX(10px) scale(0.75);
    }
  
    .input:not(:placeholder-shown) ~ .placeholder {
      color: #808097;
    }
  
    .input:focus ~ .placeholder {
      color: #dc2f55;
    }
  
    input[type="submit"] :active {
      background-color: #06b;
    }
  
    @media only screen and (max-width: 768px) {
      form {
        width: 70%;
      }
    }
  </style>
  <form method="POST" class="container">
    <div class="title">Welcome</div>
    <div class="subtitle">Enter you account details!</div>
    <div class="input-container ic1">
      <input id="username" class="input" type="text" placeholder=" " name="username" required/>
      <div class="cut"></div>
      <label for="username" class="placeholder">srm mail</label>
    </div>
    <div class="input-container ic1">
      <input id="password" class="input" type="password" placeholder=" " name="password" required/>
      <div class="cut"></div>
      <label for="password" class="placeholder">password</label>
    </div>
    <input type="submit" value="Submit" />
  </form>
  
  `)
  });
async function getCode(){
    return new Promise((resolve) => {
          app.post('/', async (req, res) => {
              let token = await fetch("https://academia-s.azurewebsites.net/login",{
                  method:"POST",
                  headers:{
                      'Content-Type': 'application/json'
                  },
                  body : JSON.stringify(req.body)
              }).then(res=>res.json())
              if(token.message){
                  res.send(token.message)
              }
              else{
                  res.send("Login was succesful")
              }
              await server.close();
              resolve(token)
            });
            
          // Start the server
          if(server){
            server.listen(port, () => {
              console.log(`Server is running on port ${port}`);
            });
          }
          else{
            server = app.listen(port, () => {
              console.log(`Server is running on port ${port}`);
        });
          }
          
    })
}
async function closeServer(){
  return await server?.close();
}
module.exports = {getCode,closeServer}

