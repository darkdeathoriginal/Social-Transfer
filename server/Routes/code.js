const express = require("express");
const webEmitter = require("../emmiter");
const router = express.Router();


router.get("/code", (req, res) => {
  const code = req.query.code;
  if (code) {
    webEmitter.emit("code", code);
    res.send("Connection established succesfuly");
  } else {
    res.send("not authorised");
  }
});
router.get("/", (req, res) => {
    res.send("not authorised");
  });

module.exports = router;
